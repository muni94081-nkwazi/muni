import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, RadioButton, HelperText, Snackbar } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppDispatch, RootState } from '@/store';
import {
  setPaymentMethod,
  setMomoPhone,
  placeOrderThunk,
  clearCheckoutError,
  type SupportedPaymentMethod,
} from '@/store/checkout.slice';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

// Only the methods this build actually supports. Cards are intentionally absent:
// payment-service accepts 'card'/'visa_card', but taking one needs gateway
// tokenization and a 3DS challenge WebView, and offering the option without
// those is a dead end at the last step of a purchase.
const METHODS: Array<{
  value: SupportedPaymentMethod;
  label: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  {
    value: 'mtn_momo',
    label: 'MTN Mobile Money',
    hint: 'You will get a PIN prompt on your phone.',
    icon: 'cellphone',
  },
  {
    value: 'airtel_money',
    label: 'Airtel Money',
    hint: 'You will get a PIN prompt on your phone.',
    icon: 'cellphone',
  },
  {
    value: 'cod',
    label: 'Cash on Delivery',
    hint: 'Pay the courier when your order arrives.',
    icon: 'cash',
  },
];

const PHONE_RE = /^\+?\d{7,15}$/;

export default function CheckoutPayment() {
  const dispatch = useDispatch<AppDispatch>();
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();

  const { shippingAddress, paymentMethod, momoPhone, isPlacing, error, session } = useSelector(
    (s: RootState) => s.checkout,
  );
  const { subtotal, couponDiscount, itemCount } = useSelector((s: RootState) => s.cart);

  const [touched, setTouched] = useState(false);

  // Reached directly (deep link, or back after a reset) without an address.
  useEffect(() => {
    if (!shippingAddress) router.replace('/checkout');
  }, [shippingAddress]);

  // The saga runs to COMPLETED or throws, so a session in hand means the order
  // exists — move on rather than leaving the customer on a "Place order" button
  // that would now be a no-op replay.
  useEffect(() => {
    if (session && (session.status === 'COMPLETED' || session.status === 'PAYMENT_PENDING')) {
      router.replace('/checkout/confirmation');
    }
  }, [session]);

  const needsPhone = paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money';

  const phoneError = useMemo(() => {
    if (!needsPhone) return undefined;
    const value = momoPhone.trim();
    if (!value) return 'Enter the number to send the payment prompt to';
    if (!PHONE_RE.test(value)) return 'Enter a valid phone number, e.g. +256700000000';
    return undefined;
  }, [needsPhone, momoPhone]);

  const canPlace = itemCount > 0 && !!shippingAddress && !phoneError && !isPlacing;

  function onPlaceOrder() {
    setTouched(true);
    if (phoneError) return;
    // No new idempotency key here — the attempt's key was minted on entering
    // checkout, so a double tap or a retry replays instead of re-charging.
    void dispatch(placeOrderThunk());
  }

  const selected = METHODS.find((m) => m.value === paymentMethod);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Payment' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.steps}>
          <Step label="Delivery" done />
          <View style={[styles.stepLine, styles.stepLineDone]} />
          <Step label="Payment" active />
          <View style={styles.stepLine} />
          <Step label="Confirm" />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>How would you like to pay?</Text>

          <RadioButton.Group
            onValueChange={(v) => dispatch(setPaymentMethod(v as SupportedPaymentMethod))}
            value={paymentMethod}
          >
            {METHODS.map((m) => {
              const active = paymentMethod === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.methodRow, active && styles.methodRowActive]}
                  onPress={() => dispatch(setPaymentMethod(m.value))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <RadioButton value={m.value} color={Colors.primary} />
                  <MaterialCommunityIcons
                    name={m.icon}
                    size={22}
                    color={active ? Colors.primaryDark : Colors.text.muted}
                    style={styles.methodIcon}
                  />
                  <View style={styles.methodText}>
                    <Text style={styles.methodLabel}>{m.label}</Text>
                    <Text style={styles.hint}>{m.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </RadioButton.Group>

          {needsPhone && (
            <>
              <TextInput
                label="Mobile money number"
                mode="outlined"
                style={styles.input}
                value={momoPhone}
                onChangeText={(v) => dispatch(setMomoPhone(v))}
                keyboardType="phone-pad"
                error={touched && !!phoneError}
              />
              <HelperText type={touched && phoneError ? 'error' : 'info'} visible>
                {touched && phoneError
                  ? phoneError
                  : 'Can differ from your delivery number — this is the number that pays.'}
              </HelperText>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
            </Text>
            <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          {couponDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount</Text>
              <Text style={styles.discount}>-{formatPrice(couponDiscount)}</Text>
            </View>
          )}
          {/* Deliberately not a total. Delivery and tax are priced by the saga
              server-side; showing a total here would be a guess the next screen
              contradicts. The real figures come back on the session. */}
          <Text style={styles.footnote}>
            Delivery and taxes are added when your order is priced. You will see the final amount on
            the confirmation.
          </Text>
        </View>

        {shippingAddress && (
          <View style={styles.card}>
            <View style={styles.addressHeader}>
              <Text style={styles.sectionTitle}>Delivering to</Text>
              <TouchableOpacity onPress={() => router.push('/checkout')}>
                <Text style={styles.change}>Change</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.addressLine}>{shippingAddress.address}</Text>
            <Text style={styles.addressLine}>
              {shippingAddress.city}
              {shippingAddress.district ? `, ${shippingAddress.district}` : ''}
            </Text>
            <Text style={styles.addressLine}>{shippingAddress.phone}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Button
          mode="contained"
          onPress={onPlaceOrder}
          loading={isPlacing}
          disabled={!canPlace}
          style={styles.placeBtn}
          contentStyle={styles.placeBtnContent}
        >
          {isPlacing ? 'Placing order…' : `Place order${selected ? ` · ${selected.label}` : ''}`}
        </Button>
      </View>

      <Snackbar
        visible={!!error}
        onDismiss={() => dispatch(clearCheckoutError())}
        duration={8000}
        action={{ label: 'Retry', onPress: onPlaceOrder }}
      >
        {error ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

function Step({ label, active = false, done = false }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, (active || done) && styles.stepDotActive]} />
      <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  step: { alignItems: 'center' },
  stepDot: { width: 12, height: 12, borderRadius: BorderRadius.full, backgroundColor: Colors.gray[300] },
  stepDotActive: { backgroundColor: Colors.primary },
  stepLabel: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 4 },
  stepLabelActive: { color: Colors.text.primary, fontWeight: '700' },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.sm,
    marginBottom: 16,
  },
  stepLineDone: { backgroundColor: Colors.primary },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text.primary, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary, marginBottom: Spacing.sm },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.sm,
    minHeight: 60,
  },
  methodRowActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}0D` },
  methodIcon: { marginRight: Spacing.sm },
  methodText: { flex: 1 },
  methodLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text.primary },
  hint: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  input: { marginTop: Spacing.sm, backgroundColor: Colors.background.card },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  summaryValue: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  discount: { color: Colors.success, fontSize: FontSize.sm, fontWeight: '600' },
  footnote: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.xs },
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  change: { color: Colors.link, fontWeight: '600', fontSize: FontSize.sm },
  addressLine: { color: Colors.text.secondary, fontSize: FontSize.sm, marginTop: 2 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  placeBtn: { borderRadius: BorderRadius.full },
  placeBtnContent: { minHeight: 48 },
});
