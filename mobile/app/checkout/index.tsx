import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppDispatch, RootState } from '@/store';
import { setShippingAddress, startAttempt } from '@/store/checkout.slice';
import { useFormatPrice } from '@/hooks';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { SignInPrompt } from '@/components/SignInPrompt';

// Fields match what checkout-service's saga actually reads (`shippingFor()`):
// address, city, district, phone, notes. Nothing else is sent, because nothing
// else is looked at.
//
// There is deliberately no delivery-method selector. The old screen had one,
// but POST /checkout/initiate accepts no such field — shipping-service quotes
// from the address and the basket. A control that cannot change the outcome is
// worse than no control: it implies a choice the customer does not have.

// Matches user-service's contactPhoneRegex: optional +, then 7-15 digits. Kept
// deliberately loose — a delivery contact may be a neighbour or an office.
const PHONE_RE = /^\+?\d{7,15}$/;

interface Errors {
  address?: string;
  city?: string;
  phone?: string;
}

export default function CheckoutShipping() {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const saved = useSelector((s: RootState) => s.checkout.shippingAddress);
  const itemCount = useSelector((s: RootState) => s.cart.itemCount);
  const subtotal = useSelector((s: RootState) => s.cart.subtotal);
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();

  const [address, setAddress] = useState(saved?.address ?? '');
  const [city, setCity] = useState(saved?.city ?? '');
  const [district, setDistrict] = useState(saved?.district ?? '');
  const [phone, setPhone] = useState(saved?.phone ?? '');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [touched, setTouched] = useState(false);

  // Minting the idempotency key here, once, is what makes every later retry a
  // retry rather than a second purchase.
  useEffect(() => {
    if (isAuthenticated) dispatch(startAttempt());
  }, [dispatch, isAuthenticated]);

  // An empty cart cannot be checked out — the saga throws EmptyCartError. Send
  // the customer back rather than letting them fill in a form for nothing. A
  // guest's cart is empty by definition, so this only applies once signed in.
  useEffect(() => {
    if (isAuthenticated && itemCount === 0) router.replace('/(tabs)/cart');
  }, [itemCount, isAuthenticated]);

  const errors: Errors = useMemo(() => {
    const e: Errors = {};
    if (!address.trim()) e.address = 'Street address is required';
    if (!city.trim()) e.city = 'City is required';
    if (!phone.trim()) e.phone = 'A delivery phone number is required';
    else if (!PHONE_RE.test(phone.trim())) e.phone = 'Enter a valid phone number, e.g. +256700000000';
    return e;
  }, [address, city, phone]);

  // Buy Now on a product screen routes straight here, so this is the one
  // protected screen a signed-out shopper can reach without passing the cart.
  if (!isAuthenticated) {
    return (
      <>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <SignInPrompt
          redirectTo="/checkout"
          icon="lock-outline"
          title="Sign in to check out"
          message="You need an account to place an order so we can confirm payment and deliver it to you."
        />
      </>
    );
  }

  const isValid = Object.keys(errors).length === 0;

  function onContinue() {
    setTouched(true);
    if (!isValid) return;

    dispatch(
      setShippingAddress({
        address: address.trim(),
        city: city.trim(),
        // Optional server-side; omitted rather than sent empty.
        ...(district.trim() ? { district: district.trim() } : {}),
        phone: phone.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    );
    router.push('/checkout/payment');
  }

  const show = (field: keyof Errors) => touched && !!errors[field];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Checkout' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.steps}>
          <Step label="Delivery" active />
          <View style={styles.stepLine} />
          <Step label="Payment" />
          <View style={styles.stepLine} />
          <Step label="Confirm" />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Where should we deliver?</Text>

          <TextInput
            label="Street address"
            mode="outlined"
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            error={show('address')}
            autoComplete="street-address"
          />
          <HelperText type="error" visible={show('address')}>
            {errors.address}
          </HelperText>

          <TextInput
            label="City / Town"
            mode="outlined"
            style={styles.input}
            value={city}
            onChangeText={setCity}
            error={show('city')}
          />
          <HelperText type="error" visible={show('city')}>
            {errors.city}
          </HelperText>

          <TextInput
            label="District (optional)"
            mode="outlined"
            style={styles.input}
            value={district}
            onChangeText={setDistrict}
          />

          <TextInput
            label="Delivery phone number"
            mode="outlined"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            error={show('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <HelperText type={show('phone') ? 'error' : 'info'} visible>
            {show('phone') ? errors.phone : 'The courier calls this number on delivery.'}
          </HelperText>

          <TextInput
            label="Delivery notes (optional)"
            mode="outlined"
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Landmark, gate colour, who to ask for…"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.summaryTitle}>Your basket</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          <Text style={styles.footnote}>
            Delivery cost and taxes are calculated on the next step, once we know where this is
            going.
          </Text>
        </View>

        <View style={styles.trustRow}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={Colors.success} />
          <Text style={styles.trustText}>Your order is protected by MUNI Buyer Protection.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Button
          mode="contained"
          onPress={onContinue}
          disabled={touched && !isValid}
          style={styles.continueBtn}
          contentStyle={styles.continueBtnContent}
        >
          Continue to payment
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

function Step({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, active && styles.stepDotActive]} />
      <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
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
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
  },
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
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  input: { marginBottom: 2, backgroundColor: Colors.background.card },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  summaryValue: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  footnote: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  trustRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm },
  trustText: { marginLeft: Spacing.sm, color: Colors.text.muted, fontSize: FontSize.xs, flex: 1 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  continueBtn: { borderRadius: BorderRadius.full },
  continueBtnContent: { minHeight: 48 },
});
