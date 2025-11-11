// userData.js - Управление данными пользователей с синхронизацией с сервером

// Получить URL API сервера
function getApiUrl() {
    // Если есть переменная окружения или настройка, используем её
    if (window.API_URL) {
        return window.API_URL;
    }
    // Иначе используем текущий домен
    return window.location.origin;
}

// Получить ID пользователя
function getUserId() {
    if (!window.tg?.initDataUnsafe?.user?.id) {
        console.error('Telegram user data not available');
        return null;
    }
    return window.tg.initDataUnsafe.user.id.toString();
}

// Стандартные данные пользователя
function getDefaultData(userId) {
    return {
        id: userId,
        username: window.tg.initDataUnsafe.user.username || `user_${userId}`,
        firstName: window.tg.initDataUnsafe.user.first_name || '',
        lastName: window.tg.initDataUnsafe.user.last_name || '',
        languageCode: window.tg.initDataUnsafe.user.language_code || 'ru',
        
        // Основные данные
        orders: [],
        vapeCoins: 0,
        stamps: 0,
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
        cart: [],
        transactions: [],
        
        // Метаданные
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
}

// Загрузить данные пользователя с сервера
async function loadUserDataFromServer(userId) {
    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/user/${userId}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.userData) {
                return data.userData;
            }
        } else if (response.status === 404) {
            // Пользователь не найден - создадим нового
            return null;
        }
    } catch (error) {
        console.error('Ошибка при загрузке данных с сервера:', error);
    }
    return null;
}

// Сохранить данные пользователя на сервер
async function saveUserDataToServer(userData) {
    const userId = getUserId();
    if (!userId || !userData) return false;
    
    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/user/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.success;
        }
    } catch (error) {
        console.error('Ошибка при сохранении данных на сервер:', error);
    }
    return false;
}

// Обновить данные пользователя на сервере (частичное обновление)
async function updateUserDataOnServer(updates) {
    const userId = getUserId();
    if (!userId || !updates) return false;
    
    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/user/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.success;
        }
    } catch (error) {
        console.error('Ошибка при обновлении данных на сервере:', error);
    }
    return false;
}

// Получить данные пользователя (с синхронизацией с сервером)
async function getUserData() {
    const userId = getUserId();
    if (!userId) return null;
    
    const storageKey = `user_${userId}`;
    const defaultData = getDefaultData(userId);
    
    // Сначала пытаемся загрузить с сервера
    try {
        const serverData = await loadUserDataFromServer(userId);
        
        if (serverData) {
            // Сохраняем в localStorage как кеш
            localStorage.setItem(storageKey, JSON.stringify(serverData));
            return serverData;
        } else {
            // Пользователь не найден на сервере - создаем нового
            // Сохраняем на сервер
            await saveUserDataToServer(defaultData);
            localStorage.setItem(storageKey, JSON.stringify(defaultData));
            return defaultData;
        }
    } catch (error) {
        console.error('Ошибка при синхронизации с сервером, используем локальные данные:', error);
        // Если сервер недоступен, используем локальные данные
        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                parsedData.lastActive = new Date().toISOString();
                return parsedData;
            }
        } catch (e) {
            console.error('Ошибка при чтении локальных данных:', e);
        }
        return defaultData;
    }
}

// Синхронная версия (для обратной совместимости, использует кеш)
function getUserDataSync() {
    const userId = getUserId();
    if (!userId) return null;
    
    const storageKey = `user_${userId}`;
    const defaultData = getDefaultData(userId);
    
    try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            return JSON.parse(savedData);
        }
    } catch (e) {
        console.error('Ошибка при чтении локальных данных:', e);
    }
    return defaultData;
}

// Сохранить данные пользователя (с синхронизацией на сервер)
function saveUserData(userData) {
    if (!userData?.id) {
        console.error('Не удалось сохранить: отсутствует ID пользователя');
        return false;
    }
    
    // Сохраняем в localStorage как кеш
    try {
        const storageKey = `user_${userData.id}`;
        localStorage.setItem(storageKey, JSON.stringify(userData));
    } catch (e) {
        console.error('Ошибка при сохранении в localStorage:', e);
    }
    
    // Синхронизируем с сервером (в фоне, не блокируем)
    saveUserDataToServer(userData).catch(err => {
        console.error('Ошибка при синхронизации на сервер:', err);
    });
    
    return true;
}

// Обновить данные пользователя (с синхронизацией на сервер)
async function updateUserData(updates) {
    const userData = await getUserData();
    if (!userData) return null;
    
    const updatedData = { 
        ...userData, 
        ...updates,
        lastActive: new Date().toISOString()
    };
    
    // Сохраняем локально
    const storageKey = `user_${userData.id}`;
    try {
        localStorage.setItem(storageKey, JSON.stringify(updatedData));
    } catch (e) {
        console.error('Ошибка при сохранении в localStorage:', e);
    }
    
    // Синхронизируем с сервером (в фоне)
    updateUserDataOnServer(updates).catch(err => {
        console.error('Ошибка при синхронизации на сервер:', err);
    });
    
    return updatedData;
}

// Добавить заказ
async function addOrder(orderData) {
    const userData = await getUserData();
    if (!userData) return null;

    const order = {
        id: orderData.id || `order_${Date.now()}`,
        date: new Date().toISOString(),
        status: orderData.status || 'new',
        ...orderData,
        items: orderData.items ? orderData.items.map(item => ({
            ...item,
            id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })) : []
    };

    userData.orders = [order, ...(userData.orders || [])];
    await updateUserData({ orders: userData.orders });
    return order;
}

// Обновить статус заказа
async function updateOrderStatus(orderId, newStatus) {
    const userData = await getUserData();
    if (!userData) return false;

    const orderIndex = userData.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return false;

    userData.orders[orderIndex].status = newStatus;
    userData.orders[orderIndex].updatedAt = new Date().toISOString();
    
    await updateUserData({ orders: userData.orders });
    return true;
}

// Добавить Vape Coins (с синхронизацией на сервер)
async function addVapeCoins(amount, reason = '') {
    const userId = getUserId();
    if (!userId) return 0;
    
    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/user/${userId}/coins`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount, reason })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Обновляем локальный кеш
                const userData = getUserDataSync();
                if (userData) {
                    userData.vapeCoins = data.balance;
                    const storageKey = `user_${userId}`;
                    localStorage.setItem(storageKey, JSON.stringify(userData));
                }
                return data.balance;
            }
        }
    } catch (error) {
        console.error('Ошибка при добавлении коинов на сервер:', error);
        // Fallback на локальное сохранение
        const userData = getUserDataSync();
        if (userData) {
            const newBalance = (userData.vapeCoins || 0) + Number(amount);
            userData.vapeCoins = newBalance;
            const storageKey = `user_${userId}`;
            localStorage.setItem(storageKey, JSON.stringify(userData));
            return newBalance;
        }
    }
    return 0;
}

// Добавить в историю просмотров
function addToViewed(productId) {
    const userData = getUserDataSync();
    if (!userData || !productId) return;

    // Удаляем дубликаты и оставляем только последние 20 просмотренных
    userData.viewedProducts = [
        productId,
        ...(userData.viewedProducts || []).filter(id => id !== productId)
    ].slice(0, 20);
    
    saveUserData(userData);
}

// Добавить в избранное (с синхронизацией на сервер)
async function toggleFavorite(productId) {
    const userId = getUserId();
    if (!userId) return false;
    
    const userData = getUserDataSync();
    if (!userData) return false;

    userData.favorites = userData.favorites || [];
    
    const index = userData.favorites.indexOf(productId);
    if (index === -1) {
        userData.favorites.push(productId);
    } else {
        userData.favorites.splice(index, 1);
    }
    
    // Сохраняем локально
    const storageKey = `user_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(userData));
    
    // Синхронизируем с сервером
    try {
        const apiUrl = getApiUrl();
        await fetch(`${apiUrl}/api/user/${userId}/favorites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ favorites: userData.favorites })
        });
    } catch (error) {
        console.error('Ошибка при синхронизации избранного:', error);
    }
    
    return true;
}

// Проверить, есть ли товар в избранном
function isFavorite(productId) {
    const userData = getUserDataSync();
    return userData?.favorites?.includes(productId) || false;
}

// Получить настройки пользователя
function getUserSettings() {
    return getUserDataSync()?.settings || {
        notifications: true,
        theme: 'light',
        language: 'ru'
    };
}

// Обновить настройки
async function updateUserSettings(newSettings) {
    const userData = await getUserData();
    if (!userData) return null;
    
    userData.settings = {
        ...userData.settings,
        ...newSettings
    };
    
    await updateUserData({ settings: userData.settings });
    return userData.settings;
}

// Функция для синхронизации корзины с сервером
async function syncCart(cart) {
    const userId = getUserId();
    if (!userId) return false;
    
    // Сохраняем локально
    const userData = getUserDataSync();
    if (userData) {
        userData.cart = cart;
        const storageKey = `user_${userId}`;
        localStorage.setItem(storageKey, JSON.stringify(userData));
    }
    
    // Синхронизируем с сервером
    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/user/${userId}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cart })
        });
        return response.ok;
    } catch (error) {
        console.error('Ошибка при синхронизации корзины:', error);
        return false;
    }
}

// Экспортируем все функции
window.userDataManager = {
    getUserData,
    getUserDataSync,
    saveUserData,
    updateUserData,
    addOrder,
    updateOrderStatus,
    addVapeCoins,
    addToViewed,
    toggleFavorite,
    isFavorite,
    getUserSettings,
    updateUserSettings,
    syncCart,
    getUserId
};
