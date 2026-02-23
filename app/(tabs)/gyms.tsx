import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, TextInput, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Search, Filter } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { SubscriptionTier } from '@/types';
import { getGymTier, getTierBadgeColors, getTierLabel } from '@/lib/gym-tier';

export default function GymsScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams<{ gymId?: string }>();
  const { filteredGyms, selectedGymFilter, setSelectedGymFilter, refetchGyms, isLoading, gymsError } = useApp();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchGyms();
    } finally {
      setRefreshing(false);
    }
  };

  const filters: Array<{ label: string; value: SubscriptionTier | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'Silver', value: 'silver' },
    { label: 'Gold', value: 'gold' },
    { label: 'Diamond', value: 'diamond' },
    { label: 'Elite', value: 'elite' },
  ];

  const displayedGyms = filteredGyms.filter(gym => 
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const orderedGyms = gymId
    ? [...displayedGyms].sort((a, b) => (a.id === gymId ? -1 : b.id === gymId ? 1 : 0))
    : displayedGyms;

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search gyms..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterChip,
                selectedGymFilter === filter.value && styles.filterChipActive
              ]}
              onPress={() => setSelectedGymFilter(filter.value)}
            >
              <Text style={[
                styles.filterText,
                selectedGymFilter === filter.value && styles.filterTextActive
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.gymList}
        contentContainerStyle={styles.gymListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.black}
          />
        }
      >
        {!!gymsError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>Couldn’t load gyms</Text>
            <Text style={styles.errorText}>{gymsError}</Text>
          </View>
        )}
        {orderedGyms.map((gym) => {
          const tier = getGymTier(gym);
          const badge = getTierBadgeColors(tier);
          const label = getTierLabel(tier);
          return (
          <TouchableOpacity 
            key={gym.id} 
            style={styles.gymCard}
            onPress={() => {
              router.push({
                pathname: '/gym-details',
                params: { gymId: gym.id },
              } as any);
            }}
          >
            <Image 
              source={{ uri: gym.imageUrl }} 
              style={styles.gymImage}
              resizeMode="cover"
            />
            <View style={styles.gymInfo}>
              <View style={styles.gymHeader}>
                <Text style={styles.gymName}>{gym.name}</Text>
                <View style={[styles.categoryBadge, { backgroundColor: badge.backgroundColor }]}>
                  <Text style={[styles.categoryText, { color: badge.textColor }]}>{label.toUpperCase()}</Text>
                </View>
              </View>
              
              <View style={styles.locationRow}>
                <MapPin size={14} color={Colors.textSecondary} />
                <Text style={styles.locationText}>{gym.address}</Text>
              </View>

              <View style={styles.amenitiesRow}>
                {gym.amenities.slice(0, 3).map((amenity, index) => (
                  <View key={index} style={styles.amenityTag}>
                    <Text style={styles.amenityText}>{amenity}</Text>
                  </View>
                ))}
                {gym.amenities.length > 3 && (
                  <View style={styles.amenityTag}>
                    <Text style={styles.moreAmenities}>+{gym.amenities.length - 3}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.hoursText}>{gym.hours}</Text>
            </View>
          </TouchableOpacity>
          );
        })}

        {orderedGyms.length === 0 && (
          <View style={styles.emptyState}>
            <Filter size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {gymsError ? 'Unable to load gyms' : 'No gyms found'}
            </Text>
            <Text style={styles.emptySubtext}>
              {gymsError ? 'Pull to refresh or try again later.' : 'Try adjusting your filters'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchSection: {
    padding: 20,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: Colors.text,
  },
  filterScroll: {
    marginHorizontal: -20,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  filterTextActive: {
    color: Colors.white,
  },
  gymList: {
    flex: 1,
  },
  gymListContent: {
    padding: 20,
    paddingTop: 8,
  },
  gymCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gymImage: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surface,
  },
  gymInfo: {
    padding: 16,
  },
  gymHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  gymName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginRight: 12,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.background,
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 6,
  },
  amenityTag: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  amenityText: {
    fontSize: 12,
    color: Colors.text,
  },
  moreAmenities: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  hoursText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#991B1B',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
  },
});
