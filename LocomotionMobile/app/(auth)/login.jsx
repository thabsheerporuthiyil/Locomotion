import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';

import {
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_SIGN_IN_READY,
  GOOGLE_WEB_CLIENT_ID,
} from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      offlineAccess: false,
      profileImageSize: 160,
    });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const result = await signIn(email.trim().toLowerCase(), password);
    if (!result.success) {
      setErrorMsg(result.error);
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    if (!GOOGLE_SIGN_IN_READY) {
      setErrorMsg(
        'Google sign-in is not configured yet. Add your mobile Google client IDs first.'
      );
      return;
    }

    setGoogleLoading(true);
    setErrorMsg('');

    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      if (GoogleSignin.hasPreviousSignIn()) {
        await GoogleSignin.signOut();
      }

      const googleResult = await GoogleSignin.signIn();

      if (googleResult?.type === 'cancelled') {
        return;
      }

      const googleData = googleResult?.data || googleResult;
      const idToken = googleData?.idToken || null;

      if (!idToken) {
        setErrorMsg('Google sign-in did not return a valid ID token.');
        return;
      }

      const result = await signInWithGoogle(idToken);
      if (!result.success) {
        await GoogleSignin.signOut();
        setErrorMsg(result.error);
      }
    } catch (error) {
      console.error('Google native sign-in error:', error);

      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            break;
          case statusCodes.IN_PROGRESS:
            setErrorMsg('Google sign-in is already in progress.');
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setErrorMsg('Google Play Services is not available on this device.');
            break;
          default:
            if (
              error.message?.includes('not supported in Expo Go') ||
              error.message?.includes('Native module')
            ) {
              setErrorMsg(
                'Google sign-in needs a development build. It will not work inside Expo Go.'
              );
            } else if (
              error.code === 'DEVELOPER_ERROR' ||
              error.code === '10' ||
              error.message?.includes('DEVELOPER_ERROR') ||
              error.message?.includes('code 10') ||
              error.message?.includes('Developer console')
            ) {
              setErrorMsg(
                'Google Sign-In Android config mismatch. Check package name, SHA-1, and Android OAuth client ID.'
              );
            } else {
              setErrorMsg(
                error.message
                  ? `Google sign-in failed: ${error.message}`
                  : 'Unable to complete Google sign-in. Please try again.'
              );
            }
        }
      } else {
        setErrorMsg(
          error?.message
            ? `Google sign-in failed: ${error.message}`
            : 'Unable to complete Google sign-in. Please try again.'
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>DRIVER APP</Text>
          </View>

          <Text style={styles.brand}>LOCOMOTION</Text>
          <Text style={styles.heading}>Welcome back, partner</Text>
          <Text style={styles.subheading}>
            Sign in to manage ride requests, trip status, and live rider updates.
          </Text>

          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="driver@company.com"
                placeholderTextColor="#6B7280"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading || googleLoading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <>
                  <FontAwesome name="google" size={18} color="#0F172A" />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.helperText}>
              Only approved drivers can access this app. Customer accounts are not
              allowed here.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  brandBadgeText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heading: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 18,
  },
  subheading: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  errorBox: {
    backgroundColor: 'rgba(127, 29, 29, 0.45)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  errorText: {
    color: '#FECACA',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#FFFFFF',
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#5B4CFF',
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#5B4CFF',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  dividerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 12,
    letterSpacing: 1,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 18,
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
