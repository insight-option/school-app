import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from './theme';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string | null;
  helper?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  required?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, helper, leftIcon, rightIcon, onRightIconPress, containerStyle, secureTextEntry, required, style, editable = true, ...rest },
  ref,
) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[{ gap: spacing.xs }, containerStyle]}>
      {label ? (
        <Text variant="captionStrong" color="textMuted">
          {label}
          {required ? <Text color="danger"> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          { borderColor, borderRadius: radius.md, backgroundColor: editable ? colors.surface : colors.surfaceAlt, minHeight: theme.touchTarget },
        ]}
      >
        {leftIcon ? <Ionicons name={leftIcon} size={20} color={colors.textFaint} style={styles.icon} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={hidden}
          editable={editable}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
          style={[styles.input, { color: colors.text, textAlign: rest.textAlign ?? undefined }, style]}
        />
        {secureTextEntry ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} style={styles.icon} />
          </Pressable>
        ) : rightIcon ? (
          <Pressable accessibilityRole="button" onPress={onRightIconPress} hitSlop={8} disabled={!onRightIconPress}>
            <Ionicons name={rightIcon} size={20} color={colors.textMuted} style={styles.icon} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="textMuted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10, writingDirection: 'auto' },
  icon: { marginHorizontal: 4 },
});
