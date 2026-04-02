import { Link } from 'expo-router';
import { Linking } from 'react-native';

export function ExternalLink({ href, ...rest }) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          event.preventDefault();
          await Linking.openURL(href);
        }
      }}
    />
  );
}
