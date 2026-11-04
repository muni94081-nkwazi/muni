export const isValidPhone = (phone: string): boolean => {
  // basic Uganda phone validation
  const ugPhoneRegex = /^(?:\+256|0)(?:7[0-9]|8[0-9]|4[0-9])[0-9]{7}$/;
  return ugPhoneRegex.test(phone);
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPrice = (price: number): boolean => {
  return price > 0 && Number.isInteger(price);
};
