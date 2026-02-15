import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CreditCard, Plus, Trash2, Apple } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PaymentMethod {
  id: string;
  type: 'card' | 'apple_pay';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: Date;
}

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (firebaseUser) {
      loadPaymentMethods();
    }
  }, [firebaseUser]);

  const loadPaymentMethods = async () => {
    if (!firebaseUser) return;
    
    try {
      setIsLoading(true);
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      const data = userDoc.data();
      const methods = data?.paymentMethods || [];
      
      // Convert Firestore timestamps to Dates
      const convertedMethods = methods.map((m: any) => ({
        ...m,
        createdAt: m.createdAt?.toDate?.() || new Date(),
      }));
      
      setPaymentMethods(convertedMethods);
    } catch (error) {
      console.error('Error loading payment methods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePaymentMethods = async (methods: PaymentMethod[]) => {
    if (!firebaseUser) return;
    
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        paymentMethods: methods.map(m => ({
          ...m,
          createdAt: m.createdAt,
        })),
      });
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Error saving payment methods:', error);
      throw error;
    }
  };

  const handleAddCard = () => {
    Alert.prompt(
      'Add Card',
      'Enter card details',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (cardNumber) => {
            if (!cardNumber || cardNumber.length < 4) {
              Alert.alert('Error', 'Please enter a valid card number');
              return;
            }

            const last4 = cardNumber.slice(-4);
            const newMethod: PaymentMethod = {
              id: `pm_${Date.now()}`,
              type: 'card',
              last4,
              brand: cardNumber.startsWith('4') ? 'Visa' : 'Mastercard',
              expiryMonth: 12,
              expiryYear: new Date().getFullYear() + 2,
              isDefault: paymentMethods.length === 0,
              createdAt: new Date(),
            };

            const updated = [...paymentMethods, newMethod];
            await savePaymentMethods(updated);
            Alert.alert('Success', 'Card added successfully');
          },
        },
      ],
      'plain-text'
    );
  };

  const handleAddApplePay = async () => {
    const newMethod: PaymentMethod = {
      id: `pm_${Date.now()}`,
      type: 'apple_pay',
      isDefault: paymentMethods.length === 0,
      createdAt: new Date(),
    };

    const updated = [...paymentMethods, newMethod];
    await savePaymentMethods(updated);
    Alert.alert('Success', 'Apple Pay added successfully');
  };

  const handleRemove = async (id: string) => {
    Alert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = paymentMethods.filter((m) => m.id !== id);
            // If we removed the default, make the first one default
            if (updated.length > 0 && paymentMethods.find(m => m.id === id)?.isDefault) {
              updated[0].isDefault = true;
            }
            await savePaymentMethods(updated);
          },
        },
      ]
    );
  };

  const handleSetDefault = async (id: string) => {
    const updated = paymentMethods.map((m) => ({
      ...m,
      isDefault: m.id === id,
    }));
    await savePaymentMethods(updated);
  };

  const formatCardNumber = (method: PaymentMethod) => {
    if (method.type === 'apple_pay') return 'Apple Pay';
    if (method.last4) return `•••• •••• •••• ${method.last4}`;
    return 'Card';
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Payment Methods' }} />
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Payment Methods</Text>
          <Text style={styles.subtitle}>
            Manage your payment methods for faster checkout
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.black} />
            </View>
          ) : (
            <>
              {paymentMethods.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <CreditCard size={48} color={Colors.textSecondary} />
                  <Text style={styles.emptyText}>No payment methods</Text>
                  <Text style={styles.emptySubtext}>
                    Add a payment method to get started
                  </Text>
                </View>
              ) : (
                <View style={styles.methodsList}>
                  {paymentMethods.map((method) => (
                    <View key={method.id} style={styles.methodCard}>
                      <View style={styles.methodInfo}>
                        {method.type === 'apple_pay' ? (
                          <Apple size={24} color={Colors.text} />
                        ) : (
                          <CreditCard size={24} color={Colors.text} />
                        )}
                        <View style={styles.methodDetails}>
                          <Text style={styles.methodName}>
                            {formatCardNumber(method)}
                            {method.isDefault && (
                              <Text style={styles.defaultBadge}> Default</Text>
                            )}
                          </Text>
                          {method.type === 'card' && method.brand && (
                            <Text style={styles.methodBrand}>{method.brand}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.methodActions}>
                        {!method.isDefault && (
                          <TouchableOpacity
                            onPress={() => handleSetDefault(method.id)}
                            style={styles.actionButton}
                          >
                            <Text style={styles.actionText}>Set Default</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => handleRemove(method.id)}
                          style={[styles.actionButton, styles.removeButton]}
                        >
                          <Trash2 size={18} color="#DC143C" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.addButtons}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddCard}
                >
                  <Plus size={20} color={Colors.white} />
                  <Text style={styles.addButtonText}>Add Card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addButton, styles.applePayButton]}
                  onPress={handleAddApplePay}
                >
                  <Apple size={20} color={Colors.white} />
                  <Text style={styles.addButtonText}>Add Apple Pay</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  methodsList: {
    gap: 12,
    marginBottom: 24,
  },
  methodCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodDetails: {
    marginLeft: 12,
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  defaultBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DC143C',
  },
  methodBrand: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  methodActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 14,
    color: Colors.black,
    fontWeight: '500',
  },
  removeButton: {
    padding: 4,
  },
  addButtons: {
    gap: 12,
  },
  addButton: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  applePayButton: {
    backgroundColor: '#000000',
  },
  addButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
