import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ScrollView,
  Text,
  ActivityIndicator,
} from 'react-native';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface SpotlightImageViewerProps {
  visible: boolean;
  images: Array<{ id: string; imageUrl: string; title?: string; linkUrl?: string }>;
  initialIndex: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SpotlightImageViewer({
  visible,
  images,
  initialIndex,
  onClose,
}: SpotlightImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageLoading, setImageLoading] = useState<{ [key: number]: boolean }>({});
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to initial index
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * SCREEN_WIDTH,
          animated: false,
        });
      }, 100);
    }
  }, [visible, initialIndex]);

  useEffect(() => {
    // Handle ESC key on web
    if (Platform.OS === 'web' && visible && typeof window !== 'undefined') {
      const handleKeyDown = (e: any) => {
        if (e.key === 'Escape') {
          onClose();
        } else if (e.key === 'ArrowLeft') {
          goToPrevious();
        } else if (e.key === 'ArrowRight') {
          goToNext();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, currentIndex, images.length, onClose]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (Platform.OS === 'web' && visible && typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [visible]);

  const goToNext = React.useCallback(() => {
    if (currentIndex < images.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      scrollViewRef.current?.scrollTo({
        x: nextIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  }, [currentIndex, images.length]);

  const goToPrevious = React.useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      scrollViewRef.current?.scrollTo({
        x: prevIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  }, [currentIndex]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
  };

  const handleImageLoadStart = (index: number) => {
    setImageLoading((prev) => ({ ...prev, [index]: true }));
  };

  const handleImageLoadEnd = (index: number) => {
    setImageLoading((prev) => ({ ...prev, [index]: false }));
  };

  if (!visible || images.length === 0) return null;

  const canNavigate = images.length > 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Dimmed background */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={styles.backdropInner} />
        </TouchableOpacity>

        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <X size={24} color={Colors.white} />
        </TouchableOpacity>

        {/* Image counter */}
        {canNavigate && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {images.length}
            </Text>
          </View>
        )}

        {/* Carousel */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={canNavigate}
        >
          {images.map((image, index) => (
            <View key={image.id} style={styles.imageContainer}>
              {imageLoading[index] && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.white} />
                </View>
              )}
              <Image
                source={{ uri: image.imageUrl }}
                style={styles.image}
                resizeMode="contain"
                onLoadStart={() => handleImageLoadStart(index)}
                onLoadEnd={() => handleImageLoadEnd(index)}
              />
              {image.title && (
                <View style={styles.titleContainer}>
                  <View style={styles.titleBadge}>
                    <Text style={styles.titleText}>{image.title.toUpperCase()}</Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Navigation arrows (desktop only) */}
        {canNavigate && Platform.OS === 'web' && (
          <>
            {currentIndex > 0 && (
              <TouchableOpacity
                style={[styles.navButton, styles.navButtonLeft]}
                onPress={goToPrevious}
              >
                <ChevronLeft size={32} color={Colors.white} />
              </TouchableOpacity>
            )}
            {currentIndex < images.length - 1 && (
              <TouchableOpacity
                style={[styles.navButton, styles.navButtonRight]}
                onPress={goToNext}
              >
                <ChevronRight size={32} color={Colors.white} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  backdropInner: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 40,
    right: Platform.OS === 'web' ? 20 : 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 40,
    left: Platform.OS === 'web' ? 20 : 20,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  counterText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  scrollContent: {
    alignItems: 'center',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    maxWidth: '100%',
    maxHeight: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  titleBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  titleText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -22 }],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  navButtonLeft: {
    left: 20,
  },
  navButtonRight: {
    right: 20,
  },
});
