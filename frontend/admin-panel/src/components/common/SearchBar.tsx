import React, { useState, useEffect } from 'react';
import { Input } from './Input/Input';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Search...", onSearch }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      prefix="🔍"
    />
  );
};
