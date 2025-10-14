import { settingsService } from './services/index';
import { getDB } from './db';

async function testUserPreferences() {
    console.log('Testing UserPreferences functionality...');
    
    try {
        // Initialize database
        const db = getDB();
        await db.open();
        
        // Test creating user preferences
        console.log('Creating user preferences...');
        const prefs = await settingsService.createUserPreferences({
            username: 'TestUser',
            notificationsEnabled: true,
            enablePredictiveAnalytics: true,
            enableEmotionalIntelligence: true,
            theme: 'dark'
        });
        
        console.log('Created preferences:', {
            id: prefs.id,
            username: prefs.username,
            notificationsEnabled: prefs.notificationsEnabled,
            theme: prefs.theme
        });
        
        // Test getting user preferences
        console.log('Getting user preferences...');
        const retrievedPrefs = await settingsService.getUserPreferences();
        console.log('Retrieved preferences:', {
            id: retrievedPrefs?.id,
            username: retrievedPrefs?.username,
            notificationsEnabled: retrievedPrefs?.notificationsEnabled,
            theme: retrievedPrefs?.theme
        });
        
        // Test updating username
        console.log('Updating username...');
        await settingsService.setUsername('UpdatedUser');
        
        const updatedPrefs = await settingsService.getUserPreferences();
        console.log('Updated preferences:', {
            username: updatedPrefs?.username
        });
        
        // Test updating other settings
        console.log('Updating other settings...');
        await settingsService.updateUserPreferences({
            notificationsEnabled: false,
            enablePredictiveAnalytics: false,
            theme: 'light'
        });
        
        const finalPrefs = await settingsService.getUserPreferences();
        console.log('Final preferences:', {
            username: finalPrefs?.username,
            notificationsEnabled: finalPrefs?.notificationsEnabled,
            enablePredictiveAnalytics: finalPrefs?.enablePredictiveAnalytics,
            theme: finalPrefs?.theme
        });
        
        console.log('✅ All UserPreferences tests passed!');
        
    } catch (error) {
        console.error('❌ UserPreferences test failed:', error);
    }
}

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
    testUserPreferences();
}

export { testUserPreferences }; 