// userData.js - Управление данными пользователей

// Получить данные пользователя
function getUserData() {
    if (!window.tg?.initDataUnsafe?.user?.id) {
        console.error('Telegram user data not available');
        return null;
    }
    
    const userId = window.tg.initDataUnsafe.user.id;
    const storageKey = `user_${userId}`;
    
    // Стандартные данные пользователя
    const defaultData = {
        id: userId,
        username: window.tg.initDataUnsafe.user.username || `user_${userId}`,
        firstName: window.tg.initDataUnsafe.user.first_name || '',
        lastName: window.tg.initDataUnsafe.user.last_name || '',
        languageCode: window.tg.initDataUnsafe.user.language_code || 'ru',
        
        // Основные данные
        orders: [],
        vapeCoins: 0,
        referrals: 0,
        rating: 10,
        
        // Настройки
        settings: {
            notifications: true,
            theme: 'light',
            language: 'ru'
        },
        
        // Дополнительные данные
        viewedProducts: [],
        favorites: [],
        
        // Метаданные
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };

    try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            // Обновляем время последней активности
            parsedData.lastActive = new Date().toISOString();
            return parsedData;
        }
        // Сохраняем данные нового пользователя
        localStorage.setItem(storageKey, JSON.stringify(defaultData));
        return defaultData;
    } catch (e) {
        console.error('Ошибка при чтении данных пользователя:', e);
        return defaultData;
    }
}

// Сохранить данные пользователя
function saveUserData(userData) {
    if (!userData?.id) {
        console.error('Не удалось сохранить: отсутствует ID пользователя');
        return false;
    }
    
    try {
        const storageKey = `user_${userData.id}`;
        localStorage.setItem(storageKey, JSON.stringify(userData));
        return true;
    } catch (e) {
        console.error('Ошибка при сохранении данных пользователя:', e);
        return false;
    }
}

// Обновить данные пользователя
function updateUserData(updates) {
    const userData = getUserData();
    if (!userData) return null;
    
    const updatedData = { 
        ...userData, 
        ...updates,
        lastActive: new Date().toISOString()
    };
    
    return saveUserData(updatedData) ? updatedData : null;
}

// Добавить заказ
function addOrder(orderData) {
    const userData = getUserData();
    if (!userData) return null;

    const order = {
        id: `order_${Date.now()}`,
        date: new Date().toISOString(),
        status: 'new',
        ...orderData,
        items: orderData.items.map(item => ({
            ...item,
            id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }))
    };

    userData.orders = [order, ...(userData.orders || [])];
    return saveUserData(userData) ? order : null;
}

// Обновить статус заказа
function updateOrderStatus(orderId, newStatus) {
    const userData = getUserData();
    if (!userData) return false;

    const orderIndex = userData.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return false;

    userData.orders[orderIndex].status = newStatus;
    userData.orders[orderIndex].updatedAt = new Date().toISOString();
    
    return saveUserData(userData);
}

// Добавить Vape Coins
function addVapeCoins(amount, reason = '') {
    const userData = getUserData();
    if (!userData) return 0;

    const newBalance = (userData.vapeCoins || 0) + Number(amount);
    
    const transaction = {
        id: `tx_${Date.now()}`,
        type: 'vape_coins',
        amount: Number(amount),
        balance: newBalance,
        reason: reason,
        date: new Date().toISOString()
    };

    userData.vapeCoins = newBalance;
    userData.transactions = userData.transactions || [];
    userData.transactions.unshift(transaction);
    
    return saveUserData(userData) ? newBalance : 0;
}

// Добавить в историю просмотров
function addToViewed(productId) {
    const userData = getUserData();
    if (!userData || !productId) return;

    // Удаляем дубликаты и оставляем только последние 20 просмотренных
    userData.viewedProducts = [
        productId,
        ...(userData.viewedProducts || []).filter(id => id !== productId)
    ].slice(0, 20);
    
    saveUserData(userData);
}

// Добавить в избранное
function toggleFavorite(productId) {
    const userData = getUserData();
    if (!userData) return false;

    userData.favorites = userData.favorites || [];
    
    const index = userData.favorites.indexOf(productId);
    if (index === -1) {
        userData.favorites.push(productId);
    } else {
        userData.favorites.splice(index, 1);
    }
    
    return saveUserData(userData);
}

// Проверить, есть ли товар в избранном
function isFavorite(productId) {
    const userData = getUserData();
    return userData?.favorites?.includes(productId) || false;
}

// Получить настройки пользователя
function getUserSettings() {
    return getUserData()?.settings || {
        notifications: true,
        theme: 'light',
        language: 'ru'
    };
}

// Обновить настройки
function updateUserSettings(newSettings) {
    const userData = getUserData();
    if (!userData) return null;
    
    userData.settings = {
        ...userData.settings,
        ...newSettings
    };
    
    return saveUserData(userData) ? userData.settings : null;
}

// Экспортируем все функции
window.userDataManager = {
    getUserData,
    saveUserData,
    updateUserData,
    addOrder,
    updateOrderStatus,
    addVapeCoins,
    addToViewed,
    toggleFavorite,
    isFavorite,
    getUserSettings,
    updateUserSettings
};
