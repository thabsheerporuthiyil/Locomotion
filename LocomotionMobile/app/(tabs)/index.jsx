import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function HomeScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Locomotion Live</Text>
      <Text style={styles.subtitle}>Welcome, {user?.name || 'User'}!</Text>

      <TouchableOpacity
        style={[styles.button, styles.driverButton]}
        onPress={() => router.push('/driver')}
      >
        <Text style={styles.buttonText}>I am a Driver</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.riderButton]}
        onPress={() => router.push('/rider')}
      >
        <Text style={styles.buttonText}>I am a Rider</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.logoutButton]}
        onPress={signOut}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  button: {
    width: '100%',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: 'center',
  },
  driverButton: {
    backgroundColor: '#2196F3',
  },
  riderButton: {
    backgroundColor: '#00BCD4',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    marginTop: 20,
  }
});
