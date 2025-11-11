// database.js - Модуль для работы с базой данных пользователей
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Путь к файлу базы данных
const DB_PATH = path.join(__dirname, 'users.db');

// Создаем подключение к БД
const db = new Database(DB_PATH);

// Включаем WAL режим для лучшей производительности при параллельных запросах
db.pragma('journal_mode = WAL');

// Создаем таблицу пользователей, если её нет
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            language_code TEXT DEFAULT 'ru',
            
            -- Основные данные
            vape_coins REAL DEFAULT 0,
            stamps INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 10,
            referrals INTEGER DEFAULT 0,
            
            -- Данные приложения (храним как JSON)
            cart TEXT DEFAULT '[]',
            favorites TEXT DEFAULT '[]',
            viewed_products TEXT DEFAULT '[]',
            orders TEXT DEFAULT '[]',
            transactions TEXT DEFAULT '[]',
            
            -- Настройки (храним как JSON)
            settings TEXT DEFAULT '{"notifications":true,"theme":"light","language":"ru"}',
            
            -- Метаданные
            created_at TEXT DEFAULT (datetime('now')),
            last_active TEXT DEFAULT (datetime('now'))
        );
        
        CREATE TABLE IF NOT EXISTS managers (
            telegram_id TEXT PRIMARY KEY,
            city TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            last_active TEXT DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);
        CREATE INDEX IF NOT EXISTS idx_last_active ON users(last_active);
        CREATE INDEX IF NOT EXISTS idx_manager_city ON managers(city);
    `);
    
    console.log('✅ База данных инициализирована');
}

// Инициализируем БД при загрузке модуля
initDatabase();

// Получить данные пользователя
function getUserData(userId) {
    const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
    const row = stmt.get(userId);
    
    if (!row) {
        return null;
    }
    
    // Парсим JSON поля
    return {
        id: row.user_id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        languageCode: row.language_code,
        vapeCoins: row.vape_coins || 0,
        stamps: row.stamps || 0,
        rating: row.rating || 10,
        referrals: row.referrals || 0,
        cart: JSON.parse(row.cart || '[]'),
        favorites: JSON.parse(row.favorites || '[]'),
        viewedProducts: JSON.parse(row.viewed_products || '[]'),
        orders: JSON.parse(row.orders || '[]'),
        transactions: JSON.parse(row.transactions || '[]'),
        settings: JSON.parse(row.settings || '{"notifications":true,"theme":"light","language":"ru"}'),
        createdAt: row.created_at,
        lastActive: row.last_active
    };
}

// Создать или обновить данные пользователя
function saveUserData(userData) {
    const stmt = db.prepare(`
        INSERT INTO users (
            user_id, username, first_name, last_name, language_code,
            vape_coins, stamps, rating, referrals,
            cart, favorites, viewed_products, orders, transactions,
            settings, created_at, last_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            language_code = excluded.language_code,
            vape_coins = excluded.vape_coins,
            stamps = excluded.stamps,
            rating = excluded.rating,
            referrals = excluded.referrals,
            cart = excluded.cart,
            favorites = excluded.favorites,
            viewed_products = excluded.viewed_products,
            orders = excluded.orders,
            transactions = excluded.transactions,
            settings = excluded.settings,
            last_active = excluded.last_active
    `);
    
    stmt.run(
        userData.id,
        userData.username || null,
        userData.firstName || null,
        userData.lastName || null,
        userData.languageCode || 'ru',
        userData.vapeCoins || 0,
        userData.stamps || 0,
        userData.rating || 10,
        userData.referrals || 0,
        JSON.stringify(userData.cart || []),
        JSON.stringify(userData.favorites || []),
        JSON.stringify(userData.viewedProducts || []),
        JSON.stringify(userData.orders || []),
        JSON.stringify(userData.transactions || []),
        JSON.stringify(userData.settings || { notifications: true, theme: 'light', language: 'ru' }),
        userData.createdAt || new Date().toISOString(),
        new Date().toISOString()
    );
    
    return true;
}

// Обновить только определенные поля пользователя
function updateUserData(userId, updates) {
    const userData = getUserData(userId) || {
        id: userId,
        cart: [],
        favorites: [],
        viewedProducts: [],
        orders: [],
        transactions: [],
        settings: { notifications: true, theme: 'light', language: 'ru' }
    };
    
    // Объединяем обновления с существующими данными
    const updatedData = {
        ...userData,
        ...updates,
        lastActive: new Date().toISOString()
    };
    
    return saveUserData(updatedData);
}

// Обновить корзину пользователя
function updateCart(userId, cart) {
    return updateUserData(userId, { cart });
}

// Обновить избранное пользователя
function updateFavorites(userId, favorites) {
    return updateUserData(userId, { favorites });
}

// Добавить Vape Coins
function addVapeCoins(userId, amount, reason = '') {
    const userData = getUserData(userId);
    if (!userData) {
        // Создаем нового пользователя
        const newUserData = {
            id: userId,
            vapeCoins: amount,
            transactions: [{
                id: `tx_${Date.now()}`,
                type: 'vape_coins',
                amount: amount,
                balance: amount,
                reason: reason,
                date: new Date().toISOString()
            }]
        };
        saveUserData(newUserData);
        return amount;
    }
    
    const newBalance = (userData.vapeCoins || 0) + Number(amount);
    const transactions = userData.transactions || [];
    
    transactions.unshift({
        id: `tx_${Date.now()}`,
        type: 'vape_coins',
        amount: Number(amount),
        balance: newBalance,
        reason: reason,
        date: new Date().toISOString()
    });
    
    // Оставляем только последние 100 транзакций
    if (transactions.length > 100) {
        transactions.splice(100);
    }
    
    updateUserData(userId, {
        vapeCoins: newBalance,
        transactions: transactions
    });
    
    return newBalance;
}

// Обновить штампы
function updateStamps(userId, stamps) {
    return updateUserData(userId, { stamps });
}

// Добавить заказ
function addOrder(userId, orderData) {
    const userData = getUserData(userId);
    const orders = userData?.orders || [];
    
    const order = {
        id: orderData.id || `order_${Date.now()}`,
        date: new Date().toISOString(),
        status: orderData.status || 'new',
        ...orderData
    };
    
    orders.unshift(order);
    
    // Оставляем только последние 50 заказов
    if (orders.length > 50) {
        orders.splice(50);
    }
    
    updateUserData(userId, { orders });
    return order;
}

// Обновить статус заказа
function updateOrderStatus(userId, orderId, newStatus) {
    const userData = getUserData(userId);
    if (!userData) return false;
    
    const orders = userData.orders || [];
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex === -1) return false;
    
    orders[orderIndex].status = newStatus;
    orders[orderIndex].updatedAt = new Date().toISOString();
    
    updateUserData(userId, { orders });
    return true;
}

// Получить всех пользователей
function getAllUsers() {
    const stmt = db.prepare('SELECT * FROM users ORDER BY last_active DESC');
    const rows = stmt.all();
    
    return rows.map(row => ({
        id: row.user_id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        languageCode: row.language_code,
        vapeCoins: row.vape_coins || 0,
        stamps: row.stamps || 0,
        rating: row.rating || 10,
        referrals: row.referrals || 0,
        cart: JSON.parse(row.cart || '[]'),
        favorites: JSON.parse(row.favorites || '[]'),
        viewedProducts: JSON.parse(row.viewed_products || '[]'),
        orders: JSON.parse(row.orders || '[]'),
        transactions: JSON.parse(row.transactions || '[]'),
        settings: JSON.parse(row.settings || '{"notifications":true,"theme":"light","language":"ru"}'),
        createdAt: row.created_at,
        lastActive: row.last_active
    }));
}

// Получить статистику (для админов)
function getStats() {
    const stmt = db.prepare(`
        SELECT 
            COUNT(*) as total_users,
            SUM(vape_coins) as total_coins,
            SUM(stamps) as total_stamps
        FROM users
    `);
    
    return stmt.get();
}

// Закрыть соединение с БД (при завершении приложения)
function closeDatabase() {
    db.close();
}

// Экспортируем функции
module.exports = {
    getUserData,
    saveUserData,
    updateUserData,
    updateCart,
    updateFavorites,
    addVapeCoins,
    updateStamps,
    addOrder,
    updateOrderStatus,
    getAllUsers,
    getStats,
    closeDatabase
};

