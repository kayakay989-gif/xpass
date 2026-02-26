import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Bell } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface NotificationPreferences {
  push: boolean;
  sms: boolean;
  email: boolean;
  subscriptionUpdates: boolean;
  checkInReminders: boolean;
  promotionalOffers: boolean;
}

export default function NotificationsScreen() {
  const { user, firebaseUser } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    push: true,
    sms: false,
    email: true,
    subscriptionUpdates: true,
    checkInReminders: true,
    promotionalOffers: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (firebaseUser) {
      loadPreferences();
    }
  }, [firebaseUser]);

  const loadPreferences = async () => {
    if (!firebaseUser) return;
    
    try {
      setIsLoading(true);
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      const data = userDoc.data();
      
      if (data?.notificationPreferences) {
        setPreferences(data.notificationPreferences);
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async (newPreferences: NotificationPreferences) => {
    if (!firebaseUser) return;
    
    try {
      setIsSaving(true);
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        notificationPreferences: newPreferences,
      });
      setPreferences(newPreferences);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const newPreferences = {
      ...preferences,
      [key]: !preferences[key],
    };
    await savePreferences(newPreferences);
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Notifications' }} />
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.black} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Bell size={24} color={Colors.text} />
            <Text style={styles.title}>Notification Settings</Text>
          </View>
          <Text style={styles.subtitle}>
            Choose how you want to receive notifications
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Methods</Text>
            
            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Push Notifications</Text>
                <Text style={styles.preferenceDescription}>
                  Receive notifications on your device
                </Text>
              </View>
              <Switch
                value={preferences.push}
                onValueChange={() => handleToggle('push')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>SMS</Text>
                <Text style={styles.preferenceDescription}>
                  Receive notifications via text message
                </Text>
              </View>
              <Switch
                value={preferences.sms}
                onValueChange={() => handleToggle('sms')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Email</Text>
                <Text style={styles.preferenceDescription}>
                  Receive notifications via email
                </Text>
              </View>
              <Switch
                value={preferences.email}
                onValueChange={() => handleToggle('email')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Types</Text>
            
            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Subscription Updates</Text>
                <Text style={styles.preferenceDescription}>
                  Updates about your subscription status
                </Text>
              </View>
              <Switch
                value={preferences.subscriptionUpdates}
                onValueChange={() => handleToggle('subscriptionUpdates')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Check-in Notifications</Text>
                <Text style={styles.preferenceDescription}>
                  Reminders of check-ins
                </Text>
              </View>
              <Switch
                value={preferences.checkInReminders}
                onValueChange={() => handleToggle('checkInReminders')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Promotional Offers</Text>
                <Text style={styles.preferenceDescription}>
                  Special offers and discounts
                </Text>
              </View>
              <Switch
                value={preferences.promotionalOffers}
                onValueChange={() => handleToggle('promotionalOffers')}
                trackColor={{ false: Colors.border, true: '#DC143C' }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          {isSaving && (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color={Colors.black} />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 16,
  },
  preferenceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  savingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
