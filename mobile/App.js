import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { SyncProvider } from './src/sync/SyncContext';
import LoginScreen from './src/screens/LoginScreen';
import ShiftsScreen from './src/screens/ShiftsScreen';
import ShiftScreen from './src/screens/ShiftScreen';
import ScanScreen from './src/screens/ScanScreen';
import QueueScreen from './src/screens/QueueScreen';
import { colors, common } from './src/theme';

const Stack = createNativeStackNavigator();

function Navigation() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <View style={[common.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: colors.navy,
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Shifts" component={ShiftsScreen} options={{ title: 'My Shifts' }} />
            <Stack.Screen name="Shift" component={ShiftScreen} options={{ title: 'Shift Details' }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan Checkpoint' }} />
            <Stack.Screen name="Queue" component={QueueScreen} options={{ title: 'Scan Queue' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <Navigation />
      </SyncProvider>
    </AuthProvider>
  );
}
