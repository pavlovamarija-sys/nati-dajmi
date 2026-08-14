import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AgeUnit } from '@/features/toy-analysis/types/toy-analysis';

type ChildAgeInputProps = {
  value: number | null;
  unit: AgeUnit;
  onValueChange: (value: number | null) => void;
  onUnitChange: (unit: AgeUnit) => void;
};

const units: { label: string; value: AgeUnit }[] = [
  { label: 'месеци', value: 'months' },
  { label: 'години', value: 'years' },
];

export function ChildAgeInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
}: ChildAgeInputProps) {
  const handleChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    onValueChange(digitsOnly ? Number(digitsOnly) : null);
  };

  return (
    <View>
      <Text style={styles.label}>Возраст на детето</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Возраст на детето"
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={3}
          onChangeText={handleChange}
          placeholder={unit === 'months' ? '18' : '4'}
          placeholderTextColor="#8A918D"
          style={styles.input}
          value={value === null ? '' : String(value)}
        />

        <View accessibilityRole="radiogroup" style={styles.unitSelector}>
          {units.map((option) => {
            const selected = option.value === unit;

            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                onPress={() => onUnitChange(option.value)}
                style={[styles.unitButton, selected && styles.unitButtonSelected]}
              >
                <Text style={[styles.unitLabel, selected && styles.unitLabelSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#1E2A24',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C9C2B4',
    borderRadius: 12,
    borderWidth: 1,
    color: '#1E2A24',
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 16,
    width: 88,
  },
  unitSelector: {
    backgroundColor: '#E9E5DC',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    padding: 4,
  },
  unitButton: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  unitButtonSelected: {
    backgroundColor: '#FFFFFF',
  },
  unitLabel: {
    color: '#606964',
    fontSize: 15,
    fontWeight: '600',
  },
  unitLabelSelected: {
    color: '#285B43',
  },
});
