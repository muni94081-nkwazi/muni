import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CVC_LENGTH, detectCardBrand, formatCardNumber, formatExpiry, isFutureExpiry, isValidLuhn } from '@/utils/card';
import { Colors } from '@/constants/theme';
import type { CardBrand, TokenizedCard } from '@/types';

/**
 * Card-network brand marks. Deliberately literal and NOT taken from the MUNI
 * palette: these are Visa's and Mastercard's own identity colours, and the
 * badges are recognisable precisely because they do not follow our theme.
 */
const NETWORK_BRAND = {
  visa:           '#1a1f71',
  visaTint:       '#f0f1fb',
  mastercard:     '#eb001b',
  mastercardTint: '#fff2f2',
} as const;

export interface VisaCardInputProps {
  /**
   * Sends the raw card fields directly to the PCI-DSS-compliant card
   * gateway's client-side tokenization SDK and resolves with the token it
   * returns. The raw PAN/CVC never reach our backend — only `cardToken`
   * plus non-sensitive last4/brand/expiry are forwarded to `onSubmit`. Wire
   * this to the real gateway's mobile SDK at the call site.
   */
  tokenizeCard: (fields: {
    cardNumber: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
    cardholderName: string;
  }) => Promise<{ cardToken: string }>;
  onSubmit: (card: TokenizedCard) => void | Promise<void>;
  /** Set once payment-service responds with a 3DS2 challenge for this charge. */
  threeDSecureRedirectUrl?: string | null;
  /** Called if the customer dismisses the 3DS challenge instead of completing it. */
  onCancelThreeDSecure?: () => void;
  isSubmitting?: boolean;
}

export function VisaCardInput({
  tokenizeCard,
  onSubmit,
  threeDSecureRedirectUrl,
  onCancelThreeDSecure,
  isSubmitting,
}: VisaCardInputProps) {
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTokenizing, setIsTokenizing] = useState(false);

  const brand = detectCardBrand(cardNumber);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!cardholderName.trim()) {
      next.cardholderName = 'Enter the name on the card';
    }

    const digits = cardNumber.replace(/\D/g, '');
    if (!digits) {
      next.cardNumber = 'Card number is required';
    } else if (!brand) {
      next.cardNumber = 'We only accept Visa and Mastercard';
    } else if (!isValidLuhn(digits)) {
      next.cardNumber = 'Enter a valid card number';
    }

    const [month, year] = expiry.split('/');
    if (!month || !year || month.length !== 2 || year.length !== 2) {
      next.expiry = 'Enter the expiry as MM/YY';
    } else if (!isFutureExpiry(month, year)) {
      next.expiry = 'This card has expired';
    }

    if (!new RegExp(`^\\d{${CVC_LENGTH}}$`).test(cvc)) {
      next.cvc = `Enter the ${CVC_LENGTH}-digit security code`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    const digits = cardNumber.replace(/\D/g, '');
    const [month, rawYear] = expiry.split('/');
    const expiryYear = `20${rawYear}`;

    setIsTokenizing(true);
    setErrors((prev) => ({ ...prev, form: '' }));
    try {
      const { cardToken } = await tokenizeCard({
        cardNumber: digits,
        expiryMonth: month,
        expiryYear,
        cvc,
        cardholderName: cardholderName.trim(),
      });

      await onSubmit({
        cardToken,
        last4: digits.slice(-4),
        brand: brand as CardBrand,
        expiryMonth: month,
        expiryYear,
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        form: err instanceof Error ? err.message : 'We could not process your card — check your details and try again',
      }));
    } finally {
      setIsTokenizing(false);
    }
  }

  const busy = isTokenizing || Boolean(isSubmitting);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Pay with Visa or Mastercard</Text>
        <View style={styles.brandRow}>
          <BrandBadge brand="VISA" active={brand === 'VISA'} />
          <BrandBadge brand="MASTERCARD" active={brand === 'MASTERCARD'} />
        </View>
      </View>

      <Field label="Cardholder name" error={errors.cardholderName}>
        <TextInput
          style={styles.input}
          value={cardholderName}
          onChangeText={setCardholderName}
          autoComplete="cc-name"
          accessibilityLabel="Cardholder name"
          placeholder="Name as it appears on the card"
        />
      </Field>

      <Field label="Card number" error={errors.cardNumber}>
        <TextInput
          style={styles.input}
          value={cardNumber}
          onChangeText={(text) => setCardNumber(formatCardNumber(text))}
          keyboardType="number-pad"
          autoComplete="cc-number"
          accessibilityLabel="Card number"
          placeholder="4242 4242 4242 4242"
          maxLength={23}
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Expiry" error={errors.expiry}>
            <TextInput
              style={styles.input}
              value={expiry}
              onChangeText={(text) => setExpiry(formatExpiry(text))}
              keyboardType="number-pad"
              accessibilityLabel="Card expiry date, month slash year"
              placeholder="MM/YY"
              maxLength={5}
            />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="CVC" error={errors.cvc}>
            <TextInput
              style={styles.input}
              value={cvc}
              onChangeText={(text) => setCvc(text.replace(/\D/g, '').slice(0, CVC_LENGTH))}
              keyboardType="number-pad"
              secureTextEntry
              accessibilityLabel="Card security code"
              placeholder="•••"
              maxLength={CVC_LENGTH}
            />
          </Field>
        </View>
      </View>

      {errors.form ? (
        <Text style={styles.formError} accessibilityRole="alert">
          {errors.form}
        </Text>
      ) : null}

      <Text style={styles.disclaimer}>
        Your card details are encrypted and tokenized on your device — MUNI never sees or stores your full card number.
      </Text>

      <TouchableOpacity
        style={[styles.submitButton, busy && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Pay securely"
      >
        {busy ? <ActivityIndicator color={Colors.text.onAccent} /> : <Text style={styles.submitButtonText}>Pay securely</Text>}
      </TouchableOpacity>

      <Modal
        visible={Boolean(threeDSecureRedirectUrl)}
        animationType="slide"
        onRequestClose={() => onCancelThreeDSecure?.()}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Verify your card</Text>
            <TouchableOpacity onPress={() => onCancelThreeDSecure?.()} accessibilityRole="button" accessibilityLabel="Cancel verification">
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>
            Your bank requires additional verification (3-D Secure) to complete this payment.
          </Text>
          {threeDSecureRedirectUrl && (
            <WebView
              source={{ uri: threeDSecureRedirectUrl }}
              style={styles.webview}
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={styles.webviewLoader} size="large" color={Colors.primary} />}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function BrandBadge({ brand, active }: { brand: CardBrand; active: boolean }) {
  const label = brand === 'VISA' ? 'Visa' : 'Mastercard';
  return (
    <View
      style={[
        styles.brandBadge,
        { backgroundColor: brand === 'VISA' ? NETWORK_BRAND.visaTint : NETWORK_BRAND.mastercardTint, opacity: active ? 1 : 0.35 },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.brandBadgeText, { color: brand === 'VISA' ? NETWORK_BRAND.visa : NETWORK_BRAND.mastercard }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  brandRow: { flexDirection: 'row', gap: 6 },
  brandBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  brandBadgeText: { fontSize: 11, fontWeight: '800' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text.primary, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text.primary,
    backgroundColor: Colors.background.card,
  },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  fieldError: { fontSize: 12, color: Colors.error, fontWeight: '500', marginTop: 4 },
  formError: { fontSize: 13, color: Colors.error, fontWeight: '500', marginBottom: 12 },
  disclaimer: { fontSize: 11, color: Colors.text.muted, marginBottom: 16, lineHeight: 16 },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: Colors.text.onAccent, fontSize: 15, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: Colors.background.card, paddingTop: 56, paddingHorizontal: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text.primary },
  modalClose: { fontSize: 14, fontWeight: '600', color: Colors.error },
  modalSubtitle: { fontSize: 13, color: Colors.text.muted, marginBottom: 16, lineHeight: 18 },
  webview: { flex: 1, borderRadius: 8 },
  webviewLoader: { flex: 1 },
});
