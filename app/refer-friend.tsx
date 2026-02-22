import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, ActivityIndicator, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Gift, Copy, Share2, Users } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as Clipboard from 'expo-clipboard';

export default function ReferFriendScreen() {
  const { user, firebaseUser } = useAuth();
  const [referralCount, setReferralCount] = useState(0);
  const [earnedCredit, setEarnedCredit] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (firebaseUser && user?.referralCode) {
      loadReferralStats();
    }
  }, [firebaseUser, user]);

  const loadReferralStats = async () => {
    if (!firebaseUser || !user?.referralCode) return;
    
    try {
      setIsLoading(true);
      // Count users who signed up with this referral code
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referredBy', '==', user.referralCode));
      const snapshot = await getDocs(q);
      
      const count = snapshot.size;
      setReferralCount(count);
      // Each referral earns 10 JDS
      setEarnedCredit(count * 10);
    } catch (error) {
      console.error('Error loading referral stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const referralCode = user?.referralCode || 'N/A';
  const webBaseUrl =
    process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    (Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://xpass-rork-1e6ad.web.app');
  const referralLink = `${webBaseUrl.replace(/\/+$/, '')}/join?ref=${referralCode}`;

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(referralCode);
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(referralLink);
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: `Join XPASS with my referral code and get 10 JDS credit! Use code: ${referralCode}\n\n${referralLink}`,
        title: 'Join XPASS',
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Refer a Friend' }} />
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Gift size={32} color="#DC143C" />
            <Text style={styles.title}>Refer a Friend</Text>
          </View>
          <Text style={styles.subtitle}>
            Share your referral code and earn 10 JDS credit for each friend who joins!
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Users size={24} color={Colors.text} />
              <Text style={styles.statValue}>{referralCount}</Text>
              <Text style={styles.statLabel}>Friends Referred</Text>
            </View>
            <View style={styles.statCard}>
              <Gift size={24} color="#DC143C" />
              <Text style={styles.statValue}>{earnedCredit}</Text>
              <Text style={styles.statLabel}>JDS Earned</Text>
            </View>
          </View>

          <View style={styles.codeSection}>
            <Text style={styles.sectionTitle}>Your Referral Code</Text>
            <View style={styles.codeCard}>
              <Text style={styles.codeText}>{referralCode}</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyCode}
              >
                <Copy size={18} color={Colors.white} />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.linkSection}>
            <Text style={styles.sectionTitle}>Referral Link</Text>
            <View style={styles.linkCard}>
              <Text style={styles.linkText} numberOfLines={1}>
                {referralLink}
              </Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyLink}
              >
                <Copy size={18} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
          >
            <Share2 size={20} color={Colors.white} />
            <Text style={styles.shareButtonText}>Share Referral</Text>
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How it works</Text>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Share your referral code or link with friends
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                When they sign up using your code, you both get 10 JDS credit
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Credits are automatically added to your wallet
              </Text>
            </View>
          </View>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.black} />
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
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  codeSection: {
    marginBottom: 20,
  },
  linkSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 2,
  },
  linkCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  linkText: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  copyButton: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  shareButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC143C',
    marginTop: 6,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
});
