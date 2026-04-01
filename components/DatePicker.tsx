import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { Calendar, X } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, placeholder = 'Select date' }: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (dateString: string) => {
    if (dateString) {
      const date = new Date(dateString);
      onChange(date);
    } else {
      onChange(null);
    }
    if (Platform.OS !== 'web') {
      setShowPicker(false);
    }
  };

  const clearDate = (e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    onChange(null);
  };

  // Web: Use HTML5 date input
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.inputWrapper}>
          <Calendar size={18} color={Colors.textMuted} style={styles.icon} />
          <input
            ref={inputRef}
            type="date"
            value={formatDateForInput(value)}
            onChange={(e) => handleDateChange(e.target.value)}
            style={styles.webInput as any}
            placeholder={placeholder}
          />
          {value && (
            <TouchableOpacity onPress={clearDate} style={styles.clearButton}>
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Mobile: Show modal with date input
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.mobileInput}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Calendar size={18} color={Colors.textMuted} />
        <Text style={[styles.inputText, !value && styles.placeholderText]}>
          {value ? formatDate(value) : placeholder}
        </Text>
        {value && (
          <TouchableOpacity
            onPress={clearDate}
            style={styles.clearButton}
          >
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContainer}>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={formatDateForInput(value)}
                  onChange={(e) => handleDateChange(e.target.value)}
                  style={styles.mobileDateInput as any}
                  autoFocus
                />
              ) : (
                <View style={styles.nativeDatePickerContainer}>
                  <Text style={styles.nativeDatePickerText}>
                    Use your device&apos;s date picker
                  </Text>
                  <input
                    type="date"
                    value={formatDateForInput(value)}
                    onChange={(e) => handleDateChange(e.target.value)}
                    style={styles.mobileDateInput as any}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: 'relative',
  },
  icon: {
    marginRight: 8,
  },
  webInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
  },
  mobileInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  placeholderText: {
    color: Colors.textMuted,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  datePickerContainer: {
    alignItems: 'center',
  },
  mobileDateInput: {
    width: '100%',
    fontSize: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  nativeDatePickerContainer: {
    width: '100%',
    alignItems: 'center',
  },
  nativeDatePickerText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 12,
  },
});
