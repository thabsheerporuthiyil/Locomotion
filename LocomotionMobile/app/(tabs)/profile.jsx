import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';

const infoRows = (user) => [
  {
    key: 'name',
    label: 'Full Name',
    value: user?.name || 'Driver',
    icon: 'person.fill',
  },
  {
    key: 'email',
    label: 'Email Address',
    value: user?.email || 'Not available',
    icon: 'paperplane.fill',
  },
  {
    key: 'phone',
    label: 'Phone Number',
    value: user?.phoneNumber || 'Not added',
    icon: 'phone.fill',
  },
  {
    key: 'role',
    label: 'Account Type',
    value: 'Approved Driver',
    icon: 'car.fill',
  },
];

export default function ProfileScreen() {
  const { user, signOut, refreshProfile, loading } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);
  const [logoutLoading, setLogoutLoading] = React.useState(false);

  const profileInitial = useMemo(() => {
    return (user?.name || user?.email || 'D').trim().charAt(0).toUpperCase();
  }, [user?.name, user?.email]);

  const rows = useMemo(() => infoRows(user), [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    await signOut();
    setLogoutLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#6D5DF6" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>PROFILE</Text>
        <Text style={styles.title}>Driver account</Text>
        <Text style={styles.subtitle}>
          Review your driver details and safely sign out from the app.
        </Text>

        <View style={styles.heroCard}>
          {user?.profileImageUrl ? (
            <Image source={{ uri: user.profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{profileInitial}</Text>
            </View>
          )}

          <View style={styles.heroText}>
            <Text style={styles.heroName}>{user?.name || 'Driver'}</Text>
            <Text style={styles.heroEmail}>{user?.email || 'No email available'}</Text>
            <View style={styles.driverBadge}>
              <Text style={styles.driverBadgeText}>Approved Driver</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Basic details</Text>
            <TouchableOpacity
              style={[styles.refreshButton, refreshing && styles.disabledButton]}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol name="arrow.clockwise" size={16} color="#FFFFFF" />
                  <Text style={styles.refreshText}>Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {rows.map((row) => (
            <View key={row.key} style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <IconSymbol name={row.icon} size={20} color="#A5B4FC" />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, logoutLoading && styles.disabledButton]}
          onPress={handleLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <IconSymbol name="person.circle.fill" size={18} color="#FFFFFF" />
              <Text style={styles.logoutText}>Log out</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  eyebrow: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    lineHeight: 24,
    marginTop: 12,
  },
  heroCard: {
    marginTop: 28,
    backgroundColor: '#1E293B',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImage: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#0B1120',
  },
  avatarFallback: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6D5DF6',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },
  heroText: {
    marginLeft: 16,
    flex: 1,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroEmail: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    marginTop: 6,
  },
  driverBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  driverBadgeText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#334155',
  },
  refreshText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(109,93,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  logoutButton: {
    marginTop: 20,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
