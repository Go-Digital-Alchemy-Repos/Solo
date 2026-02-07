import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface AvatarProps {
  uri: string | null;
  size?: number;
  borderWidth?: number;
  showBorder?: boolean;
}

export default function Avatar({ uri, size = 44, borderWidth = 2, showBorder = true }: AvatarProps) {
  return (
    <View style={[
      styles.container,
      {
        width: size + borderWidth * 2,
        height: size + borderWidth * 2,
        borderRadius: (size + borderWidth * 2) / 2,
        borderWidth: showBorder ? borderWidth : 0,
        borderColor: showBorder ? Colors.accent : 'transparent',
      },
    ]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="person" size={size * 0.5} color={Colors.textDim} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
