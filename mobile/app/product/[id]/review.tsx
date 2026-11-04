import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import { productsApi } from '@/api/products.api';
import { Colors, Spacing } from '@/constants/theme';

const MIN_BODY = 10;   // review-service rejects anything shorter with a 400
const MAX_BODY = 5000;
const MAX_TITLE = 160;

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * Write a review for a product.
 *
 * Reached from order detail, and only for a delivered item — but that gate is a
 * convenience, not the control. review-service decides eligibility itself
 * (bought it, has not already reviewed it) and answers 403 when the client is
 * wrong, which is handled below. Never treat the client-side check as the
 * authority: it is working from a list the user could have navigated past.
 */
export default function WriteReviewScreen() {
  const { id, orderId, productName } = useLocalSearchParams<{
    id: string;
    orderId?: string;
    productName?: string;
  }>();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [touchedBody, setTouchedBody] = useState(false);

  const bodyTooShort = body.trim().length > 0 && body.trim().length < MIN_BODY;
  const canSubmit = rating > 0 && body.trim().length >= MIN_BODY && !submitting;

  const submit = async () => {
    if (!canSubmit || !id) return;
    setSubmitting(true);
    setError('');

    try {
      await productsApi.createReview({
        productId: id,
        rating,
        body: body.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(orderId ? { orderId } : {}),
      });
      router.back();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = (err.response?.data as { message?: string } | undefined)?.message;
        if (status === 403) {
          setError(msg ?? 'You can only review items you have bought and received.');
        } else if (status === 409) {
          setError(msg ?? 'You have already reviewed this product.');
        } else if (status === 400) {
          setError(msg ?? 'Please check your rating and review text.');
        } else if (!err.response) {
          setError('Cannot reach MUNI. Check your connection and try again.');
        } else {
          setError(msg ?? 'Could not submit your review. Please try again.');
        }
      } else {
        setError('Could not submit your review. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Write a review</Text>
        {productName ? <Text style={styles.product} numberOfLines={2}>{productName}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Stars are buttons, not a slider: each carries its own accessibility
            label so the control is usable without sight of the row. */}
        <View style={styles.stars} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setRating(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: rating === value }}
              accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
              disabled={submitting}
              hitSlop={6}
            >
              <MaterialCommunityIcons
                name={value <= rating ? 'star' : 'star-outline'}
                size={40}
                color={value <= rating ? Colors.warning : Colors.gray[400]}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingLabel}>
          {rating > 0 ? RATING_LABELS[rating] : 'Tap a star to rate'}
        </Text>

        <TextInput
          label="Title (optional)"
          value={title}
          onChangeText={setTitle}
          mode="outlined"
          style={styles.input}
          maxLength={MAX_TITLE}
          editable={!submitting}
        />

        <TextInput
          label="Your review"
          value={body}
          onChangeText={setBody}
          onBlur={() => setTouchedBody(true)}
          mode="outlined"
          style={styles.input}
          multiline
          numberOfLines={6}
          maxLength={MAX_BODY}
          editable={!submitting}
        />
        <HelperText type={touchedBody && bodyTooShort ? 'error' : 'info'} visible>
          {touchedBody && bodyTooShort
            ? `At least ${MIN_BODY} characters — tell other buyers a little more.`
            : `${body.trim().length}/${MAX_BODY}`}
        </HelperText>

        <Button
          mode="contained"
          onPress={() => void submit()}
          loading={submitting}
          disabled={!canSubmit}
          style={styles.button}
        >
          Submit review
        </Button>

        <Button mode="text" onPress={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  content: { padding: Spacing.lg },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: Spacing.xs },
  product: { color: Colors.gray[400], marginBottom: Spacing.lg },
  error: { color: Colors.error, marginBottom: Spacing.md },
  stars: { flexDirection: 'row', justifyContent: 'center', marginVertical: Spacing.md },
  ratingLabel: { textAlign: 'center', marginBottom: Spacing.lg, fontWeight: '600' },
  input: { marginBottom: Spacing.xs },
  button: { marginTop: Spacing.md, paddingVertical: Spacing.xs },
});
