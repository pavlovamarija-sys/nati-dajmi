import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ToyShelfImage } from '@/features/toy-analysis/types/toy-analysis';

type ImageInputProps = {
  image: ToyShelfImage | null;
  busy: boolean;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
};

export function ImageInput({
  image,
  busy,
  onTakePhoto,
  onChoosePhoto,
}: ImageInputProps) {
  return (
    <View>
      <Text style={styles.label}>Toy shelf photo</Text>
      <Text style={styles.helper}>
        Take a clear photo showing as many toys as possible.
      </Text>

      {image ? (
        <Image
          accessibilityLabel="Selected toy shelf"
          resizeMode="cover"
          source={{ uri: image.uri }}
          style={styles.preview}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Add a shelf photo</Text>
          <Text style={styles.placeholderText}>Camera or photo library</Text>
        </View>
      )}

      <View style={styles.actions}>
        <ActionButton
          disabled={busy}
          label={image ? 'Take new photo' : 'Take photo'}
          onPress={onTakePhoto}
        />
        <ActionButton
          disabled={busy}
          label={image ? 'Choose another' : 'Choose photo'}
          onPress={onChoosePhoto}
        />
      </View>
    </View>
  );
}

type ActionButtonProps = {
  label: string;
  disabled: boolean;
  onPress: () => void;
};

function ActionButton({ label, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text style={styles.actionButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#1E2A24',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  helper: {
    color: '#59635E',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  preview: {
    backgroundColor: '#E9E5DC',
    borderRadius: 18,
    height: 280,
    width: '100%',
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: '#EEEAE1',
    borderColor: '#C9C2B4',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    height: 220,
    justifyContent: 'center',
    padding: 24,
  },
  placeholderTitle: {
    color: '#34433B',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeholderText: {
    color: '#6B746F',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#E1EBE5',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 10,
  },
  actionButtonPressed: {
    opacity: 0.75,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonLabel: {
    color: '#285B43',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
