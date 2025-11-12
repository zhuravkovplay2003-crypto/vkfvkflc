const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

// Раздаем статические файлы из папки images
app.use('/images', express.static(path.join(__dirname, 'images')));

// Функции для работы с московским временем (UTC+3)
function getMoscowTime() {
    const now = new Date();
    // Получаем московское время (UTC+3)
    const moscowOffset = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
    const moscowTime = new Date(now.getTime() + moscowOffset);
    return moscowTime;
}

function getMoscowDateString() {
    const moscowTime = getMoscowTime();
    const year = moscowTime.getUTCFullYear();
    const month = String(moscowTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(moscowTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseMoscowDate(dateString) {
    // Парсим дату в формате YYYY-MM-DD и создаем Date в московском времени
    const [year, month, day] = dateString.split('-').map(Number);
    // Создаем дату в UTC, но интерпретируем как московское время
    // Для этого вычитаем 3 часа из UTC
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    // Возвращаем ISO строку
    return date.toISOString();
}

function formatMoscowDate(dateString) {
    // Если dateString уже в формате YYYY-MM-DD, просто форматируем его
    if (dateString && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-');
        return `${day}.${month}.${year}`;
    }
    // Иначе парсим как ISO строку
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${day}.${month}.${year}`;
}

function isTomorrow(dateString) {
    const today = getMoscowDateString();
    // Получаем завтрашнюю дату в московском времени
    const [year, month, day] = today.split('-').map(Number);
    const todayDate = new Date(Date.UTC(year, month - 1, day));
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrowStr = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getUTCDate()).padStart(2, '0')}`;
    return dateString === tomorrowStr;
}

// Токен вашего бота (из переменной окружения или напрямую)
const BOT_TOKEN = process.env.BOT_TOKEN || '8411665754:AAEhjD46OhbFRXb_PrcZoCcmfYK8EO5sSWM';

// ID администраторов (замените на ваши Telegram ID)
// Чтобы узнать свой ID, напишите боту @userinfobot в Telegram
// Можно указать несколько ID через запятую: ['8248768964', '123456789']
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : ['8248768964', '838488118', '8007023981'];

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Проверка, является ли пользователь администратором
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId.toString());
}

// Путь к файлу с заказами
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const MANAGERS_FILE = path.join(__dirname, 'managers.json');

// Загружаем заказы из файла
function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            const data = fs.readFileSync(ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
    return [];
}

// Сохраняем заказы в файл
function saveOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error('Error saving orders:', error);
    }
}

// Загружаем менеджеров из БД (приоритет) или из файла (fallback)
function loadManagers() {
    try {
        // Пытаемся загрузить из БД
        const managersFromDB = db.getManagersStructure();
        if (managersFromDB && Object.keys(managersFromDB).length > 0) {
            console.log('✅ Менеджеры загружены из БД');
            return managersFromDB;
        }
    } catch (error) {
        console.error('Ошибка загрузки менеджеров из БД:', error);
    }
    
    // Fallback: загружаем из файла (для совместимости)
    try {
        if (fs.existsSync(MANAGERS_FILE)) {
            const data = fs.readFileSync(MANAGERS_FILE, 'utf8');
            const managersFromFile = JSON.parse(data);
            // Мигрируем менеджеров из файла в БД
            if (managersFromFile && typeof managersFromFile === 'object') {
                Object.keys(managersFromFile).forEach(city => {
                    if (Array.isArray(managersFromFile[city])) {
                        managersFromFile[city].forEach(telegramId => {
                            try {
                                db.addManager(telegramId, city);
                            } catch (e) {
                                console.error(`Ошибка миграции менеджера ${telegramId} для города ${city}:`, e);
                            }
                        });
                    }
                });
                console.log('✅ Менеджеры мигрированы из файла в БД');
                return db.getManagersStructure();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки менеджеров из файла:', error);
    }
    
    // Структура по умолчанию
    return {
        'mogilev': [],
        'minsk': [],
        'default': []
    };
}

// Сохраняем менеджеров в БД
function saveManagers(managers) {
    try {
        // Сохраняем каждого менеджера в БД
        Object.keys(managers).forEach(city => {
            if (Array.isArray(managers[city])) {
                managers[city].forEach(telegramId => {
                    try {
                        db.addManager(telegramId, city);
                    } catch (e) {
                        console.error(`Ошибка сохранения менеджера ${telegramId} для города ${city}:`, e);
                    }
                });
            }
        });
        console.log('✅ Менеджеры сохранены в БД');
        
        // Также сохраняем в файл для совместимости
    try {
        fs.writeFileSync(MANAGERS_FILE, JSON.stringify(managers, null, 2));
        } catch (fileError) {
            console.warn('Не удалось сохранить менеджеров в файл (не критично):', fileError);
        }
    } catch (error) {
        console.error('Ошибка сохранения менеджеров:', error);
    }
}

let orders = loadOrders();
let managers = loadManagers();

// Определяем город из адреса
function getCityFromLocation(location) {
    if (!location) return 'default';
    
    const locationLower = location.toLowerCase();
    if (locationLower.includes('могилев') || locationLower.includes('mogilev')) {
        return 'mogilev';
    } else if (locationLower.includes('минск') || locationLower.includes('minsk')) {
        return 'minsk';
    }
    return 'default';
}

// Форматируем заказ для менеджера
// Функция для обновления всех сообщений о заказе для всех менеджеров
async function updateOrderMessagesForAllManagers(order, messageText, replyMarkup = null, confirmedBy = null) {
    if (!order.orderMessages) {
        console.log('No orderMessages found for order', order.id);
        return;
    }
    
    const allManagers = Object.keys(order.orderMessages);
    console.log(`Updating messages for ${allManagers.length} managers for order ${order.id}`);
    
    for (const managerId of allManagers) {
        const messageId = order.orderMessages[managerId];
        if (messageId) {
            try {
                // Если заказ подтвержден и это не тот менеджер, который подтвердил - показываем что заказ взят другим
                let finalMessageText = messageText;
                let finalReplyMarkup = replyMarkup;
                
                if (confirmedBy && order.confirmedBy && order.confirmedBy.toString() !== managerId.toString()) {
                    // Это другой менеджер - показываем что заказ уже взят
                    const confirmedByUsername = order.confirmedByUsername || 'менеджер';
                    const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
                    finalMessageText = messageText + `\n\n${userInfo}\n\n⚠️ Заказ уже взят менеджером ${confirmedByUsername} (ID: ${order.confirmedBy})`;
                    finalReplyMarkup = null; // Убираем кнопки для других менеджеров
                } else {
                    // Добавляем информацию о клиенте если её нет в сообщении
                    const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
                    if (!messageText.includes('👤 Клиент ID:')) {
                        finalMessageText = messageText.replace(/\n\n/, `\n${userInfo}\n`);
                    }
                }
                
                await bot.telegram.editMessageText(
                    managerId,
                    messageId,
                    null,
                    finalMessageText,
                    {
                        parse_mode: 'HTML',
                        reply_markup: finalReplyMarkup
                    }
                );
                console.log(`Updated message for manager ${managerId}, message_id: ${messageId}`);
            } catch (error) {
                console.error(`Error updating message for manager ${managerId}:`, error.message);
            }
        }
    }
}

// Функция для отправки уведомления клиенту
async function notifyClient(order, status, message) {
    if (!order.userId || order.userId === 'unknown') {
        console.log('Cannot notify client: userId is unknown');
        return;
    }
    
    try {
        await bot.telegram.sendMessage(order.userId, message, {
            parse_mode: 'HTML'
        });
        console.log(`Notification sent to client ${order.userId} for order ${order.id}, status: ${status}`);
    } catch (error) {
        console.error(`Error sending notification to client ${order.userId}:`, error.message);
        // Если клиент не начал диалог с ботом, это нормально
    }
}

function formatOrderForManager(order) {
    // Форматируем список товаров с подробной информацией
    const itemsText = order.items.map((item, index) => {
        let text = `${index + 1}. <b>${item.name || 'Товар'}</b>`;
        
        // Добавляем информацию о параметрах товара
        if (item.flavor) {
            text += `\n   🍬 Вкус: ${item.flavor}`;
        }
        if (item.strength) {
            text += `\n   💪 Крепость: ${item.strength}`;
        }
        if (item.color) {
            text += `\n   🎨 Цвет: ${item.color}`;
        }
        if (item.resistance) {
            text += `\n   ⚡ Сопротивление: ${item.resistance}`;
        }
        
        text += `\n   📦 Количество: ${item.quantity || 1} шт.`;
        
        // Показываем цену в зависимости от способа оплаты
        if (item.paymentMethod === 'coins') {
            text += `\n   💰 Цена: ${(item.vapeCoinsPrice * (item.quantity || 1)).toFixed(1)} 🪙 (коины)`;
        } else {
            text += `\n   💰 Цена: ${(item.price * (item.quantity || 1)).toFixed(2)} BYN`;
        }
        
        return text;
    }).join('\n\n');
    
    const totalText = order.vapeCoinsSpent > 0 
        ? `${order.total.toFixed(2)} BYN + ${order.vapeCoinsSpent.toFixed(1)} 🪙`
        : `${order.total.toFixed(2)} BYN`;
    
    const deliveryInfo = order.deliveryType === 'selfPickup'
        ? `📍 Самовывоз: ${order.location}`
        : `🚚 Доставка: ${order.location}`;
    
    // Форматируем дату доставки
    let dateInfo = '';
    if (order.selectedDeliveryDay) {
        const deliveryDate = new Date(order.selectedDeliveryDay + 'T12:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const deliveryDateOnly = new Date(deliveryDate);
        deliveryDateOnly.setHours(0, 0, 0, 0);
        
        // Всегда показываем дату, а не слово "завтра"
        dateInfo = `\n📅 <b>Дата доставки: ${deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b>`;
    }
    
    const timeInfo = order.deliveryTime 
        ? `\n⏰ Время: ${order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime}${order.deliveryExactTime ? ` (${order.deliveryExactTime})` : ''}`
        : '';
    
    const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
    
    return `📦 <b>Новый заказ #${order.id.slice(-6)}</b>\n\n` +
           `${deliveryInfo}${dateInfo}${timeInfo}\n\n` +
           `<b>Товары:</b>\n${itemsText}\n\n` +
           `<b>Итого:</b> ${totalText}\n\n` +
           `${userInfo}`;
}

// ==================== API для работы с данными пользователей ====================

// GET: Получить данные пользователя
app.get('/api/user/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const userData = db.getUserData(userId);
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({ success: true, userData });
    } catch (error) {
        console.error('Error getting user data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: Создать или обновить данные пользователя
app.post('/api/user/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const userData = req.body;
        
        // Убеждаемся, что ID совпадает
        userData.id = userId;
        
        db.saveUserData(userData);
        
        res.json({ success: true, message: 'User data saved' });
    } catch (error) {
        console.error('Error saving user data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH: Обновить частичные данные пользователя
app.patch('/api/user/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const updates = req.body;
        
        db.updateUserData(userId, updates);
        
        res.json({ success: true, message: 'User data updated' });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET: Получить список всех пользователей (только для администраторов)
app.get('/api/users', (req, res) => {
    try {
        // ВАЖНО: Добавьте проверку на администратора для безопасности
        // const adminId = req.query.adminId;
        // if (!adminId || !ADMIN_IDS.includes(adminId)) {
        //     return res.status(403).json({ success: false, error: 'Access denied' });
        // }
        
        const allUsers = db.getAllUsers();
        res.json({ success: true, users: allUsers, count: allUsers.length });
    } catch (error) {
        console.error('Error getting all users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: Обновить корзину пользователя
app.post('/api/user/:userId/cart', (req, res) => {
    try {
        const userId = req.params.userId;
        const cart = req.body.cart || [];
        
        db.updateCart(userId, cart);
        
        res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: Обновить избранное пользователя
app.post('/api/user/:userId/favorites', (req, res) => {
    try {
        const userId = req.params.userId;
        const favorites = req.body.favorites || [];
        
        db.updateFavorites(userId, favorites);
        
        res.json({ success: true, message: 'Favorites updated' });
    } catch (error) {
        console.error('Error updating favorites:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: Добавить Vape Coins
app.post('/api/user/:userId/coins', (req, res) => {
    try {
        const userId = req.params.userId;
        const { amount, reason } = req.body;
        
        if (!amount || isNaN(amount)) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        const newBalance = db.addVapeCoins(userId, amount, reason || '');
        
        res.json({ success: true, balance: newBalance });
    } catch (error) {
        console.error('Error adding coins:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST: Обновить штампы
app.post('/api/user/:userId/stamps', (req, res) => {
    try {
        const userId = req.params.userId;
        const { stamps } = req.body;
        
        if (stamps === undefined || isNaN(stamps)) {
            return res.status(400).json({ success: false, error: 'Invalid stamps value' });
        }
        
        db.updateStamps(userId, stamps);
        
        res.json({ success: true, message: 'Stamps updated' });
    } catch (error) {
        console.error('Error updating stamps:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== API для работы с заказами ====================

// API endpoint для приема заказов от клиентского приложения
app.post('/api/orders', (req, res) => {
    try {
        const orderData = req.body;
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Определяем дату заказа (используем московское время)
        let orderDate;
        console.log('Order data received:', {
            deliveryTime: orderData.deliveryTime,
            selectedDeliveryDay: orderData.selectedDeliveryDay,
            deliveryExactTime: orderData.deliveryExactTime
        });
        
        if (orderData.selectedDeliveryDay) {
            // Приоритет: selectedDeliveryDay (уже в формате YYYY-MM-DD)
            orderDate = parseMoscowDate(orderData.selectedDeliveryDay);
            console.log('Using selectedDeliveryDay:', orderDate, 'Moscow date:', orderData.selectedDeliveryDay);
        } else if (orderData.deliveryTime && orderData.deliveryTime.includes('|')) {
            // Если deliveryTime содержит дату (формат 'YYYY-MM-DD|HH:MM-HH:MM')
            const [dateStr] = orderData.deliveryTime.split('|');
            orderDate = parseMoscowDate(dateStr);
            console.log('Using deliveryTime date:', orderDate, 'Moscow date:', dateStr);
        } else {
            // Иначе используем текущую дату в московском времени
            const moscowDate = getMoscowDateString();
            orderDate = parseMoscowDate(moscowDate);
            console.log('Using current Moscow date:', orderDate, 'Moscow date string:', moscowDate);
        }
        
        const order = {
            id: orderId,
            date: orderDate,
            status: 'pending', // Ожидает подтверждения
            createdAt: new Date().toISOString(),
            items: orderData.items || [],
            location: orderData.location || '',
            deliveryType: orderData.deliveryType || 'selfPickup',
            deliveryTime: orderData.deliveryTime || null,
            deliveryExactTime: orderData.deliveryExactTime || null,
            selectedDeliveryDay: orderData.selectedDeliveryDay || null,
            deliveryAddress: orderData.deliveryAddress || null,
            pickupLocation: orderData.pickupLocation || null,
            total: orderData.total || 0,
            vapeCoinsSpent: orderData.vapeCoinsSpent || 0,
            userId: orderData.userId || 'unknown',
            userUsername: orderData.userUsername || null
        };
        
        orders.push(order);
        saveOrders(orders);
        
        // ВАЖНО: Сохраняем заказ в БД пользователя
        if (order.userId && order.userId !== 'unknown') {
            try {
                db.addOrder(order.userId, {
                    id: order.id,
                    date: order.date,
                    createdAt: order.createdAt,
                    status: 'pending',
                    items: order.items,
                    location: order.location,
                    deliveryType: order.deliveryType,
                    deliveryTime: order.deliveryTime,
                    deliveryExactTime: order.deliveryExactTime,
                    selectedDeliveryDay: order.selectedDeliveryDay,
                    deliveryAddress: order.deliveryAddress,
                    pickupLocation: order.pickupLocation,
                    total: order.total,
                    vapeCoinsSpent: order.vapeCoinsSpent || 0
                });
                console.log(`✅ Заказ ${order.id} сохранен в БД пользователя ${order.userId}`);
            } catch (error) {
                console.error('Ошибка сохранения заказа в БД пользователя:', error);
            }
        }
        
        // Определяем город и отправляем заказ менеджерам
        const city = getCityFromLocation(order.location);
        // Получаем менеджеров для города и всех администраторов
        const cityManagers = managers[city] || [];
        const defaultManagers = managers['default'] || [];
        const allManagers = [...new Set([...cityManagers, ...defaultManagers, ...ADMIN_IDS])]; // Убираем дубликаты
        
        console.log(`Sending order to managers. City: ${city}, City managers: ${cityManagers.length}, Default managers: ${defaultManagers.length}, All managers: ${allManagers.length}`);
        console.log(`Managers object:`, JSON.stringify(managers, null, 2));
        console.log(`All manager IDs:`, allManagers);
        
        if (allManagers.length > 0) {
            // Сохраняем message_id для каждого менеджера, чтобы потом обновлять сообщения
            const orderMessages = {};
            const sendPromises = [];
            
            allManagers.forEach(managerId => {
                const promise = bot.telegram.sendMessage(managerId, formatOrderForManager(order), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подтвердить', callback_data: `confirm_${order.id}` },
                                { text: '❌ Отклонить', callback_data: `reject_${order.id}` }
                            ]
                        ]
                    }
                }).then((msg) => {
                    orderMessages[managerId] = msg.message_id;
                    console.log(`Order sent to manager ${managerId} successfully, message_id: ${msg.message_id}`);
                }).catch(err => {
                    console.error(`Error sending to manager ${managerId}:`, err.message);
                });
                sendPromises.push(promise);
            });
            
            // Ждем отправки всех сообщений, затем сохраняем message_id
            Promise.all(sendPromises).then(() => {
                // Сохраняем message_id для каждого менеджера в заказе
                order.orderMessages = orderMessages;
                saveOrders(orders);
                console.log(`Order notification sent to ${Object.keys(orderMessages).length} managers. Order messages saved.`);
            }).catch(err => {
                console.error('Error saving order messages:', err);
            });
        } else {
            console.warn(`No managers found for city: ${city}. Order saved but not sent.`);
            // Отправляем администраторам, если нет менеджеров
            ADMIN_IDS.forEach(adminId => {
                bot.telegram.sendMessage(adminId, 
                    `⚠️ <b>Новый заказ, но нет менеджеров для города: ${city}</b>\n\n` +
                    formatOrderForManager(order), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подтвердить', callback_data: `confirm_${order.id}` },
                                { text: '❌ Отклонить', callback_data: `reject_${order.id}` }
                            ]
                        ]
                    }
                }).catch(err => {
                    console.error(`Error sending to admin ${adminId}:`, err.message);
                });
            });
        }
        
        res.json({ success: true, orderId: order.id });
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для получения статуса заказа
app.get('/api/orders/:orderId/status', (req, res) => {
    const order = orders.find(o => o.id === req.params.orderId);
    if (order) {
        res.json({ 
            success: true,
            status: order.status,
            order: {
                id: order.id,
                status: order.status,
                vapeCoinsEarned: order.vapeCoinsEarned || null,
                confirmedBy: order.confirmedBy || null,
                transferredBy: order.transferredBy || null
            }
        });
    } else {
        res.status(404).json({ success: false, error: 'Order not found' });
    }
});

// API для получения занятых времен для даты
app.get('/api/orders/booked-times', (req, res) => {
    try {
        const dateKey = req.query.date;
        const location = req.query.location; // Опционально: точка самовывоза
        if (!dateKey) {
            return res.status(400).json({ success: false, error: 'Date parameter required' });
        }
        
        // ВАЖНО: Собираем заказы из файла orders.json (всех пользователей) И из базы данных (всех пользователей)
        // Это гарантирует, что время занято для всех клиентов, а не только для текущего пользователя
        const allBookedTimes = [];
        
        // ВАЖНО: Нормализуем адрес для сравнения (без учета регистра и форматирования)
        const normalizeLocation = (loc) => {
            if (!loc) return '';
            return loc.trim().toLowerCase().replace(/\s+/g, ' ');
        };
        const normalizedLocation = location ? normalizeLocation(location) : null;
        
        // 1. Заказы из файла orders.json (всех пользователей)
        orders.forEach(order => {
            // ВАЖНО: Учитываем только заказы со статусом, который означает что заказ реально создан
            if (order.selectedDeliveryDay === dateKey && 
                order.deliveryExactTime && 
                (order.status === 'pending' || order.status === 'confirmed' || order.status === 'transferred') &&
                order.status !== 'cancelled' && order.status !== 'rejected') {
                
                // ВАЖНО: Проверяем адрес самовывоза - время занято только для конкретного адреса
                const orderPickupLocation = order.pickupLocation || order.location || '';
                const normalizedOrderLocation = normalizeLocation(orderPickupLocation);
                
                // Если указана точка самовывоза, проверяем её (с нормализацией)
                if (normalizedLocation && normalizedOrderLocation) {
                    if (normalizedLocation !== normalizedOrderLocation) {
                        return; // Пропускаем заказы с другой точкой самовывоза
                    }
                } else if (normalizedLocation && !normalizedOrderLocation) {
                    return; // Если в запросе указан адрес, а в заказе нет - пропускаем
                } else if (!normalizedLocation && normalizedOrderLocation) {
                    return; // Если в запросе не указан адрес, а в заказе есть - пропускаем
                }
                
                allBookedTimes.push(order.deliveryExactTime);
            }
        });
        
        // 2. Заказы из базы данных (всех пользователей)
        try {
            const allUsers = db.getAllUsers();
            allUsers.forEach(user => {
                if (user.orders && Array.isArray(user.orders)) {
                    user.orders.forEach(order => {
                        // ВАЖНО: Учитываем только заказы со статусом, который означает что заказ реально создан
                        if (order.selectedDeliveryDay === dateKey && 
                            order.deliveryExactTime && 
                            (order.status === 'pending' || order.status === 'confirmed' || order.status === 'transferred') &&
                            order.status !== 'cancelled' && order.status !== 'rejected') {
                            
                            // ВАЖНО: Проверяем адрес самовывоза - время занято только для конкретного адреса
                            const orderPickupLocation = order.pickupLocation || order.location || '';
                            const normalizedOrderLocation = normalizeLocation(orderPickupLocation);
                            
                            // Если указана точка самовывоза, проверяем её (с нормализацией)
                            if (normalizedLocation && normalizedOrderLocation) {
                                if (normalizedLocation !== normalizedOrderLocation) {
                                    return; // Пропускаем заказы с другой точкой самовывоза
                                }
                            } else if (normalizedLocation && !normalizedOrderLocation) {
                                return; // Если в запросе указан адрес, а в заказе нет - пропускаем
                            } else if (!normalizedLocation && normalizedOrderLocation) {
                                return; // Если в запросе не указан адрес, а в заказе есть - пропускаем
                            }
                            
                            allBookedTimes.push(order.deliveryExactTime);
                        }
                    });
                }
            });
        } catch (dbError) {
            console.error('Ошибка получения заказов из БД для booked-times:', dbError);
            // Продолжаем работу даже если БД недоступна
        }
        
        // Убираем дубликаты
        const uniqueBookedTimes = [...new Set(allBookedTimes)];
        
        res.json({ success: true, bookedTimes: uniqueBookedTimes });
    } catch (error) {
        console.error('Error getting booked times:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для получения всех заказов (для админа)
app.get('/api/orders', (req, res) => {
    res.json({ success: true, orders: orders });
});

// API для отмены заказа клиентом
app.post('/api/orders/:orderId/cancel', (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = orders.find(o => o.id === orderId);
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        // Можно отменить только заказы в ожидании, обработке или подтвержденные (но не переданные)
        if (order.status !== 'pending' && order.status !== 'processing' && order.status !== 'confirmed') {
            if (order.status === 'transferred') {
                return res.status(400).json({ success: false, error: 'Order already transferred' });
            } else if (order.status === 'rejected') {
                return res.status(400).json({ success: false, error: 'Order already rejected' });
            } else if (order.status === 'cancelled') {
                return res.status(400).json({ success: false, error: 'Order already cancelled' });
            }
            return res.status(400).json({ success: false, error: 'Order cannot be cancelled' });
        }
        
        // Меняем статус заказа на "отменен"
        order.status = 'cancelled';
        order.cancelledBy = 'client';
        order.cancelledAt = new Date().toISOString();
        
        saveOrders(orders);
        
        // Формируем текст для обновления всех сообщений менеджерам
        const moscowTime = getMoscowTime();
        const cancelMessage = `<b>❌ Заказ #${order.id.slice(-6)} отменен клиентом</b>\n\n` +
            `Клиент отменил заказ самостоятельно\n` +
            `Время: ${moscowTime.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
        
        // Обновляем все сообщения для всех менеджеров (убираем кнопки)
        updateOrderMessagesForAllManagers(order, cancelMessage, null).then(() => {
            console.log(`Order ${orderId} cancelled by client. Managers notified.`);
        }).catch(err => {
            console.error('Error notifying managers about cancellation:', err);
        });
        
        // Обновляем количество товаров в Google Sheets (увеличиваем обратно)
        try {
            const updateItems = order.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                flavor: item.flavor || null,
                location: order.deliveryType === 'selfPickup' ? order.pickupLocation : null
            }));
            
            const fakeReq = {
                body: {
                    orderId: order.id,
                    items: updateItems,
                    action: 'increase',
                    location: order.deliveryType === 'selfPickup' ? order.pickupLocation : null
                }
            };
            
            const fakeRes = {
                status: (code) => ({ json: (data) => {
                    if (code === 200) {
                        console.log('✅ Количество товаров возвращено в Google Sheets при отмене клиентом');
                    }
                }}),
                json: (data) => {
                    if (data.success) {
                        console.log('✅ Количество товаров возвращено в Google Sheets при отмене клиентом');
                    }
                }
            };
            
            const updateStockHandler = app._router.stack.find(layer => 
                layer.route && layer.route.path === '/api/orders/update-stock' && layer.route.methods.post
            );
            
            if (updateStockHandler) {
                updateStockHandler.route.stack[0].handle(fakeReq, fakeRes).catch(err => {
                    console.error('Ошибка обновления количества при отмене клиентом:', err);
                });
            }
        } catch (error) {
            console.error('Ошибка обновления количества товаров при отмене клиентом:', error);
        }
        
        res.json({ success: true, message: 'Order cancelled' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для добавления менеджера (только для администраторов)
// Endpoint для обновления Google таблицы после заказа
app.post('/api/orders/update-stock', async (req, res) => {
    try {
        const { orderId, items, action = 'decrease', location } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Не указаны товары для обновления' });
        }
        
        // action может быть 'decrease' (уменьшить) или 'increase' (увеличить)
        const isDecrease = action === 'decrease';
        const isIncrease = action === 'increase';
        
        if (!isDecrease && !isIncrease) {
            return res.status(400).json({ success: false, error: 'Неверное действие. Используйте "decrease" или "increase"' });
        }
        
        // Конфигурация Google таблицы (из app.js)
        const GOOGLE_SHEETS_CONFIG = {
            sheetId: '16IWmjfm__yJ2Ryqhm97vjJx-gKVcfkTANdq2lkojmvw',
            productsGid: '0',
            variantsGid: '1804830457',
            apiKey: 'AIzaSyAJaShY7Th_2yrG4jXEUS2xIkfl3Glx6x8'
        };
        
        // Загружаем данные из таблицы для поиска товаров
        // Используем встроенный модуль https для Node.js
        const https = require('https');
        const url = require('url');
        
        const fetchCSV = (csvUrl) => {
            return new Promise((resolve, reject) => {
                const parsedUrl = url.parse(csvUrl);
                https.get(parsedUrl, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            resolve(data);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    });
                }).on('error', reject);
            });
        };
        
        const productsUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.sheetId}/export?format=csv&gid=${GOOGLE_SHEETS_CONFIG.productsGid}`;
        const variantsUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.sheetId}/export?format=csv&gid=${GOOGLE_SHEETS_CONFIG.variantsGid}`;
        
        let productsText, variantsText;
        try {
            productsText = await fetchCSV(productsUrl);
            try {
                variantsText = await fetchCSV(variantsUrl);
            } catch (err) {
                console.log('Ошибка загрузки вариантов (продолжаем):', err.message);
                variantsText = '';
            }
        } catch (error) {
            throw new Error(`Ошибка загрузки таблицы товаров: ${error.message}`);
        }
        
        // Парсим CSV
        const parseCSV = (csvText) => {
            const lines = csvText.split('\n').filter(line => line.trim());
            if (lines.length === 0) return [];
            
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            return lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = values[index] || '';
                });
                return obj;
            });
        };
        
        const productsData = parseCSV(productsText);
        const variantsData = variantsText ? parseCSV(variantsText) : [];
        
        // Объединяем данные товаров и вариантов
        const allProducts = productsData.map(product => {
            const productVariants = variantsData.filter(v => v.productId === product.id || v['ID товара'] === product.id);
            return { ...product, variants: productVariants };
        });
        
        // Обновляем количество для каждого товара
        const updates = [];
        
        console.log(`📦 Обрабатываем ${items.length} товаров для обновления`);
        
        for (const item of items) {
            const productId = item.productId?.toString() || '';
            const quantity = parseInt(item.quantity) || 0;
            const flavor = item.flavor || null;
            const location = item.location || null;
            
            console.log(`\n🔍 Товар: productId=${productId}, quantity=${quantity}, flavor=${flavor}, location=${location}`);
            
            if (!productId || quantity <= 0) {
                console.log(`⚠️ Пропускаем товар: неверный productId или quantity`);
                continue;
            }
            
            // Находим товар в таблице
            const product = allProducts.find(p => 
                p.id === productId || 
                p['ID'] === productId ||
                p['id'] === productId ||
                p['ID']?.toString() === productId
            );
            
            if (!product) {
                console.log(`❌ Товар с ID ${productId} не найден в таблице`);
                console.log(`📋 Доступные ID товаров (первые 5):`, productsData.slice(0, 5).map(p => p.id || p['ID'] || p['id']));
                continue;
            }
            
            console.log(`✅ Товар найден:`, product.name || product['Название'] || 'Без названия');
            
            // Находим строку товара (нумерация с 2, так как первая строка - заголовки)
            const productRowIndex = productsData.findIndex(p => 
                (p.id === productId || p['ID'] === productId || p['id'] === productId)
            ) + 2; // +2 потому что первая строка - заголовки, и индексация с 1 в Google Sheets
            
            if (productRowIndex < 2) continue;
            
            // Определяем колонки для обновления
            // Предполагаем структуру: ID, Название, Количество, Продано шт, и т.д.
            // Нужно найти индексы колонок по заголовкам
            const headers = productsText.split('\n')[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            console.log(`📋 Заголовки таблицы товаров:`, headers);
            
            // Ищем колонки
            const quantityColIndex = headers.findIndex(h => 
                h.toLowerCase().includes('количество') || 
                h.toLowerCase().includes('quantity') ||
                h.toLowerCase().includes('остаток')
            );
            console.log(`📊 Индекс колонки "Количество": ${quantityColIndex}`);
            
            const soldColIndex = headers.findIndex(h => 
                h.toLowerCase().includes('продано') || 
                h.toLowerCase().includes('sold') ||
                h.toLowerCase().includes('продаж')
            );
            console.log(`💰 Индекс колонки "Продано": ${soldColIndex}`);
            
            // ОБЯЗАТЕЛЬНО нужно обновить количество в вариантах, даже если нет flavor
            // Количество хранится в таблице "Варианты товаров" в колонках точек
            if (location && variantsData.length > 0) {
                console.log(`🔍 Ищем вариант: productId=${productId}, flavor=${flavor || 'без вкуса'}, location=${location}`);
                
                // Ищем вариант в таблице вариантов
                // Если есть flavor, ищем по нему, иначе берем первый вариант для этого товара
                let variant;
                if (flavor) {
                    variant = variantsData.find(v => 
                        (v.productId === productId || v['ID товара'] === productId || v['ID товара']?.toString() === productId) &&
                        (v.flavor === flavor || v['Вкус'] === flavor || v['вкус'] === flavor)
                    );
                } else {
                    // Если нет flavor, берем первый вариант для этого товара
                    variant = variantsData.find(v => 
                        v.productId === productId || v['ID товара'] === productId || v['ID товара']?.toString() === productId
                    );
                }
                
                if (variant) {
                    console.log(`✅ Вариант найден:`, variant);
                    const variantRowIndex = variantsData.findIndex(v => {
                        if (flavor) {
                            return (v.productId === productId || v['ID товара'] === productId || v['ID товара']?.toString() === productId) &&
                                   (v.flavor === flavor || v['Вкус'] === flavor || v['вкус'] === flavor);
                        } else {
                            return v.productId === productId || v['ID товара'] === productId || v['ID товара']?.toString() === productId;
                        }
                    }) + 2;
                    
                    const variantHeaders = variantsText.split('\n')[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                    console.log(`📋 Заголовки вариантов:`, variantHeaders);
                    
                    // Ищем колонку с количеством для конкретного адреса
                    // Формат может быть: "Минск, ст. м. Грушевка" или просто название адреса
                    const locationColIndex = variantHeaders.findIndex(h => {
                        const hLower = h.toLowerCase().trim();
                        const locLower = location.toLowerCase().trim();
                        // Более гибкий поиск - ищем частичное совпадение
                        // Убираем все пробелы и сравниваем
                        const hClean = hLower.replace(/\s+/g, '');
                        const locClean = locLower.replace(/\s+/g, '');
                        return hLower === locLower || 
                               hLower.includes(locLower) || 
                               locLower.includes(hLower) ||
                               hClean.includes(locClean) ||
                               locClean.includes(hClean);
                    });
                    
                    console.log(`📍 Индекс колонки для location "${location}": ${locationColIndex}`);
                    console.log(`📍 Все заголовки с location:`, variantHeaders.filter(h => h.toLowerCase().includes('минск') || h.toLowerCase().includes('грушевка')));
                    
                    if (locationColIndex >= 0 && variantRowIndex >= 2) {
                        // Обновляем количество на адресе
                        const currentQuantity = parseInt(variant[variantHeaders[locationColIndex]] || '0');
                        let newQuantity;
                        if (isDecrease) {
                            newQuantity = Math.max(0, currentQuantity - quantity);
                        } else {
                            newQuantity = currentQuantity + quantity;
                        }
                        
                        console.log(`📊 Обновление варианта: ${currentQuantity} -> ${newQuantity} (${action})`);
                        console.log(`📝 Ячейка: ${String.fromCharCode(65 + locationColIndex)}${variantRowIndex}`);
                        
                        updates.push({
                            sheetId: GOOGLE_SHEETS_CONFIG.variantsGid,
                            range: `${String.fromCharCode(65 + locationColIndex)}${variantRowIndex}`,
                            value: newQuantity.toString()
                        });
                    } else {
                        console.log(`⚠️ Не найдена колонка для location "${location}" или неверный индекс строки ${variantRowIndex}`);
                        console.log(`⚠️ Доступные заголовки:`, variantHeaders);
                    }
                } else {
                    console.log(`⚠️ Вариант не найден для productId=${productId}, flavor=${flavor || 'без вкуса'}`);
                    console.log(`⚠️ Доступные варианты для этого товара:`, variantsData.filter(v => 
                        v.productId === productId || v['ID товара'] === productId || v['ID товара']?.toString() === productId
                    ).map(v => ({ id: v['ID товара'], flavor: v['Вкус'] || v.flavor })));
                }
            } else {
                if (!location) {
                    console.log(`⚠️ Не указан location для товара ${productId} - количество не может быть обновлено`);
                    console.log(`⚠️ Количество хранится в таблице "Варианты товаров" в колонках точек`);
                }
                if (variantsData.length === 0) {
                    console.log(`⚠️ Нет данных вариантов - таблица "Варианты товаров" пуста`);
                }
            }
            
            // НЕ обновляем общее количество в таблице "Товары", так как там нет такой колонки
            // Количество хранится только в таблице "Варианты товаров" в колонках точек
            
            // Обновляем графу "продано шт" (только при уменьшении, при увеличении не трогаем)
            // Только если такая колонка есть
            if (soldColIndex >= 0 && isDecrease) {
                const currentSold = parseInt(product[headers[soldColIndex]] || '0');
                const newSold = currentSold + quantity;
                
                updates.push({
                    sheetId: GOOGLE_SHEETS_CONFIG.productsGid,
                    range: `${String.fromCharCode(65 + soldColIndex)}${productRowIndex}`,
                    value: newSold.toString()
                });
                console.log(`💰 Обновляем "Продано": ${currentSold} -> ${newSold}`);
            } else if (isDecrease) {
                console.log(`⚠️ Колонка "Продано" не найдена, пропускаем обновление`);
            }
        }
        
        // Пытаемся обновить таблицу через Google Sheets API
        let updatedCount = 0;
        
        console.log(`📊 Подготовлено ${updates.length} обновлений для заказа ${orderId}`);
        console.log(`📋 Действие: ${action}`);
        if (updates.length > 0) {
            console.log('📝 Обновления:', JSON.stringify(updates.slice(0, 3), null, 2)); // Показываем первые 3
        }
        
        try {
            // Проверяем наличие credentials
            const credentialsPath = path.join(__dirname, 'credentials.json');
            console.log(`🔑 Проверяем credentials.json по пути: ${credentialsPath}`);
            
            if (fs.existsSync(credentialsPath)) {
                console.log('✅ Файл credentials.json найден');
                // Используем Service Account для аутентификации
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                const auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });
                
                const sheets = google.sheets({ version: 'v4', auth });
                
                // Получаем информацию о листах для определения имен и соответствия GID -> sheetId
                const spreadsheet = await sheets.spreadsheets.get({
                    spreadsheetId: GOOGLE_SHEETS_CONFIG.sheetId
                });
                
                const sheetNameMap = {};
                const gidToSheetIdMap = {};
                spreadsheet.data.sheets.forEach(sheet => {
                    const sheetId = sheet.properties.sheetId;
                    const title = sheet.properties.title;
                    sheetNameMap[sheetId.toString()] = title;
                    // Создаем обратное соответствие: ищем лист по названию для определения sheetId
                    if (title === 'Товары' || title.toLowerCase().includes('товар')) {
                        gidToSheetIdMap[GOOGLE_SHEETS_CONFIG.productsGid] = sheetId;
                    }
                    if (title === 'Варианты товаров' || title.toLowerCase().includes('вариант')) {
                        gidToSheetIdMap[GOOGLE_SHEETS_CONFIG.variantsGid] = sheetId;
                    }
                });
                
                // Группируем обновления по листам (используем sheetId вместо GID)
                const updatesBySheet = {};
                updates.forEach(update => {
                    // Конвертируем GID в sheetId
                    const sheetId = gidToSheetIdMap[update.sheetId] || update.sheetId;
                    const sheetIdStr = sheetId.toString();
                    
                    if (!updatesBySheet[sheetIdStr]) {
                        updatesBySheet[sheetIdStr] = [];
                    }
                    updatesBySheet[sheetIdStr].push({
                        range: update.range,
                        values: [[update.value]]
                    });
                });
                
                // Выполняем обновления для каждого листа
                for (const [sheetIdStr, sheetUpdates] of Object.entries(updatesBySheet)) {
                    try {
                        // Получаем имя листа по sheetId
                        const sheetName = sheetNameMap[sheetIdStr] || 'Лист1';
                        
                        const updateData = sheetUpdates.map(update => ({
                            range: `${sheetName}!${update.range}`,
                            values: update.values
                        }));
                        
                        console.log(`📤 Отправляем обновления для листа "${sheetName}":`, JSON.stringify(updateData.slice(0, 2), null, 2));
                        
                        const result = await sheets.spreadsheets.values.batchUpdate({
                            spreadsheetId: GOOGLE_SHEETS_CONFIG.sheetId,
                            requestBody: {
                                valueInputOption: 'USER_ENTERED',
                                data: updateData
                            }
                        });
                        
                        updatedCount += sheetUpdates.length;
                        console.log(`✅ Обновлено ${sheetUpdates.length} ячеек в листе "${sheetName}"`);
                        console.log(`📊 Результат обновления:`, JSON.stringify(result.data, null, 2));
                    } catch (error) {
                        console.error(`Ошибка обновления листа ${sheetGid}:`, error.message);
                    }
                }
            } else {
                console.log('⚠️ Файл credentials.json не найден. Обновления не выполнены.');
                console.log('Для работы обновления нужно:');
                console.log('1. Создать Service Account в Google Cloud Console');
                console.log('2. Скачать JSON ключ и сохранить как credentials.json в папку serv/');
                console.log('3. Дать доступ Service Account к таблице');
                console.log(`📁 Текущая директория: ${__dirname}`);
                console.log(`📁 Путь к credentials: ${credentialsPath}`);
            }
        } catch (error) {
            console.error('Ошибка при обновлении через Google Sheets API:', error.message);
        }
        
        console.log(`Заказ ${orderId}: подготовлено ${updates.length} обновлений, выполнено ${updatedCount}`);
        
        res.json({ 
            success: true, 
            message: `Подготовлено ${updates.length} обновлений, выполнено ${updatedCount}`,
            updates: updates.length,
            updated: updatedCount,
            note: updatedCount === 0 ? 'Для работы обновления нужно настроить Google Sheets API (credentials.json)' : 'Обновления выполнены успешно'
        });
        
    } catch (error) {
        console.error('Ошибка обновления Google таблицы:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Ошибка обновления таблицы' 
        });
    }
});

app.post('/api/managers', (req, res) => {
    try {
        const { city, telegramId, adminId } = req.body;
        
        // ВАЖНО: Проверяем права администратора
        if (!adminId || !isAdmin(adminId)) {
            return res.status(403).json({ success: false, error: 'Только администратор может добавлять менеджеров' });
        }
        
        if (!city || !telegramId) {
            return res.status(400).json({ success: false, error: 'City and telegramId required' });
        }
        
        if (!managers[city]) {
            managers[city] = [];
        }
        
        if (!managers[city].includes(telegramId)) {
            managers[city].push(telegramId);
            saveManagers(managers);
        }
        
        res.json({ success: true, managers: managers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обработка действий менеджера в боте
bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        console.log('Callback data received:', data);
        
        // Перезагружаем заказы из файла перед обработкой
        const freshOrders = loadOrders();
        
        // Используем более надежный способ разделения
        let action, orderId;
        if (data.startsWith('confirm_')) {
            action = 'confirm';
            orderId = data.substring(8); // Убираем "confirm_"
        } else if (data.startsWith('reject_')) {
            action = 'reject';
            orderId = data.substring(7); // Убираем "reject_"
        } else if (data.startsWith('details_')) {
            action = 'details';
            orderId = data.substring(8); // Убираем "details_"
        } else if (data.startsWith('transfer_')) {
            action = 'transfer';
            orderId = data.substring(9); // Убираем "transfer_"
        } else {
            return ctx.answerCbQuery('Неизвестное действие');
        }
        
        console.log('Action:', action, 'OrderId:', orderId);
        console.log('Total orders:', freshOrders.length);
        console.log('Order IDs:', freshOrders.map(o => o.id));
        
        const order = freshOrders.find(o => o.id === orderId);
        
        if (!order) {
            console.error('Order not found:', orderId);
            return ctx.answerCbQuery('Заказ не найден');
        }
        
        // Обновляем глобальный массив orders
        orders = freshOrders;
        
        // Проверяем, не обработан ли уже заказ другим менеджером
        // Для confirm проверяем, что заказ еще pending
        if (action === 'confirm' && order.status !== 'pending') {
            if (order.status === 'confirmed' || order.status === 'transferred') {
                return ctx.answerCbQuery('Заказ уже подтвержден другим менеджером');
            } else if (order.status === 'rejected') {
                return ctx.answerCbQuery('Заказ уже отклонен другим менеджером');
            }
        }
        
        // Для reject можно отменять pending и confirmed заказы
        if (action === 'reject') {
            if (order.status === 'transferred') {
                return ctx.answerCbQuery('Заказ уже передан клиенту, его нельзя отменить');
            } else if (order.status === 'rejected') {
                return ctx.answerCbQuery('Заказ уже отклонен');
            } else if (order.status === 'cancelled') {
                return ctx.answerCbQuery('Заказ уже отменен');
            }
        }
        
        // Для transfer проверяем, что заказ подтвержден, но еще не передан
        // И что это тот менеджер, который подтвердил заказ
        if (action === 'transfer') {
            if (order.status !== 'confirmed') {
                if (order.status === 'transferred') {
                    return ctx.answerCbQuery('Заказ уже передан клиенту');
                } else if (order.status === 'pending') {
                    return ctx.answerCbQuery('Сначала нужно подтвердить заказ');
                } else if (order.status === 'rejected') {
                    return ctx.answerCbQuery('Заказ был отклонен');
                }
            }
            // Проверяем, что это тот менеджер, который подтвердил заказ
            if (order.confirmedBy && order.confirmedBy.toString() !== ctx.from.id.toString()) {
                return ctx.answerCbQuery('Заказ управляется другим менеджером');
            }
        }
        
        // Для reject проверяем, что это тот менеджер, который подтвердил заказ (если заказ был confirmed)
        if (action === 'reject' && order.status === 'confirmed') {
            if (order.confirmedBy && order.confirmedBy.toString() !== ctx.from.id.toString()) {
                return ctx.answerCbQuery('Заказ управляется другим менеджером');
            }
        }
        
        if (action === 'confirm') {
            order.status = 'confirmed';
            order.confirmedBy = ctx.from.id;
            order.confirmedByUsername = ctx.from.username || ctx.from.first_name;
            order.confirmedAt = new Date().toISOString();
            
            saveOrders(orders);
            
            // ВАЖНО: Обновляем заказ в БД пользователя
            if (order.userId && order.userId !== 'unknown') {
                try {
                    db.updateOrderStatus(order.userId, order.id, 'confirmed');
                    console.log(`✅ Статус заказа ${order.id} обновлен в БД пользователя ${order.userId}`);
                } catch (error) {
                    console.error('Ошибка обновления статуса заказа в БД:', error);
                }
            }
            
            console.log(`Order ${order.id} confirmed. Status: ${order.status}`);
            
            ctx.answerCbQuery('✅ Заказ подтвержден');
            
            // Формируем текст для обновления всех сообщений
            const moscowTime = getMoscowTime();
            const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
            const confirmMessage = `<b>✅ Заказ #${order.id.slice(-6)} подтвержден</b>\n\n` +
                `${userInfo}\n` +
                `Подтвердил: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${moscowTime.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n` +
                `Нажмите кнопку ниже, когда заказ будет передан клиенту:`;
            
            const confirmReplyMarkup = {
                inline_keyboard: [
                    [
                        { text: '📦 Заказ передан', callback_data: `transfer_${order.id}` }
                    ],
                    [
                        { text: '❌ Отменить заказ', callback_data: `reject_${order.id}` }
                    ]
                ]
            };
            
            // Обновляем все сообщения для всех менеджеров
            // Только подтвердивший менеджер может управлять заказом
            await updateOrderMessagesForAllManagers(order, confirmMessage, confirmReplyMarkup, ctx.from.id);
            
            // Отправляем уведомление клиенту
            const deliveryDateText = order.selectedDeliveryDay 
                ? formatMoscowDate(order.selectedDeliveryDay)
                : (order.date ? formatMoscowDate(order.date) : 'сегодня');
            const deliveryTimeText = order.deliveryTime 
                ? (order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime)
                : '';
            const exactTimeText = order.deliveryExactTime ? ` (${order.deliveryExactTime})` : '';
            const locationText = order.deliveryType === 'selfPickup' 
                ? `Точка самовывоза: ${order.pickupLocation || order.location}`
                : `Адрес доставки: ${order.deliveryAddress || order.location}`;
            
            const clientNotification = `✅ <b>Ваш заказ #${order.id.slice(-6)} подтвержден!</b>\n\n` +
                `📅 Дата доставки: ${deliveryDateText}\n` +
                `⏰ Время: ${deliveryTimeText}${exactTimeText}\n` +
                `📍 ${locationText}\n\n` +
                `Заказ будет передан вам в указанное время.`;
            
            await notifyClient(order, 'confirmed', clientNotification);
        } else if (action === 'reject') {
            // Можно отменять pending и confirmed заказы
            if (order.status === 'transferred') {
                return ctx.answerCbQuery('Заказ уже передан клиенту, его нельзя отменить');
            } else if (order.status === 'rejected') {
                return ctx.answerCbQuery('Заказ уже отклонен');
            } else if (order.status === 'cancelled') {
                return ctx.answerCbQuery('Заказ уже отменен');
            }
            
            order.status = 'rejected';
            order.rejectedBy = ctx.from.id;
            order.rejectedByUsername = ctx.from.username || ctx.from.first_name;
            order.rejectedAt = new Date().toISOString();
            
            saveOrders(orders);
            
            ctx.answerCbQuery('Заказ отменен');
            
            // Формируем текст для обновления всех сообщений
            const moscowTime = getMoscowTime();
            const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
            const rejectMessage = `<b>❌ Заказ #${order.id.slice(-6)} отменен</b>\n\n` +
                `${userInfo}\n` +
                `Отменил: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${moscowTime.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
            
            // Обновляем все сообщения для всех менеджеров (убираем кнопки)
            // Если заказ был confirmed, передаем confirmedBy чтобы другие менеджеры видели что заказ взят
            await updateOrderMessagesForAllManagers(order, rejectMessage, null, order.confirmedBy || null);
            
            // Отправляем уведомление клиенту (всегда, даже если заказ был confirmed)
            const deliveryDateText = order.selectedDeliveryDay 
                ? formatMoscowDate(order.selectedDeliveryDay)
                : (order.date ? formatMoscowDate(order.date) : 'сегодня');
            const deliveryTimeText = order.deliveryTime 
                ? (order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime)
                : '';
            const exactTimeText = order.deliveryExactTime ? ` (${order.deliveryExactTime})` : '';
            const locationText = order.deliveryType === 'selfPickup' 
                ? `Точка самовывоза: ${order.pickupLocation || order.location}`
                : `Адрес доставки: ${order.deliveryAddress || order.location}`;
            
            const clientNotification = `❌ <b>Ваш заказ #${order.id.slice(-6)} отменен</b>\n\n` +
                `📅 Дата: ${deliveryDateText}\n` +
                `⏰ Время: ${deliveryTimeText}${exactTimeText}\n` +
                `📍 ${locationText}\n\n` +
                `К сожалению, заказ не может быть выполнен. Обратитесь в поддержку для уточнения деталей.`;
            
            await notifyClient(order, 'rejected', clientNotification);
            
            // Обновляем количество товаров в Google Sheets (увеличиваем обратно)
            // Вызываем внутренний обработчик напрямую
            try {
                const updateItems = order.items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    flavor: item.flavor || null,
                    location: order.deliveryType === 'selfPickup' ? order.pickupLocation : null
                }));
                
                // Создаем фейковый req/res объект для внутреннего вызова
                const fakeReq = {
                    body: {
                        orderId: order.id,
                        items: updateItems,
                        action: 'increase',
                        location: order.deliveryType === 'selfPickup' ? order.pickupLocation : null
                    }
                };
                
                const fakeRes = {
                    status: (code) => ({ json: (data) => {
                        if (code === 200) {
                            console.log('✅ Количество товаров возвращено в Google Sheets при отмене менеджером');
                        } else {
                            console.error('Ошибка обновления количества при отмене:', code, data);
                        }
                    }}),
                    json: (data) => {
                        if (data.success) {
                            console.log('✅ Количество товаров возвращено в Google Sheets при отмене менеджером');
                        } else {
                            console.error('Ошибка обновления количества при отмене:', data);
                        }
                    }
                };
                
                // Находим обработчик update-stock и вызываем его
                const updateStockHandler = app._router.stack.find(layer => 
                    layer.route && layer.route.path === '/api/orders/update-stock' && layer.route.methods.post
                );
                
                if (updateStockHandler) {
                    updateStockHandler.route.stack[0].handle(fakeReq, fakeRes).catch(err => {
                        console.error('Ошибка обновления количества товаров при отмене менеджером:', err);
                    });
                } else {
                    // Если не нашли обработчик, используем HTTP запрос
                    const https = require('https');
                    const updateStockData = JSON.stringify(fakeReq.body);
                    const updateStockOptions = {
                        hostname: 'localhost',
                        port: process.env.PORT || 3000,
                        path: '/api/orders/update-stock',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(updateStockData)
                        }
                    };
                    
                    const updateStockReq = https.request(updateStockOptions, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                console.log('✅ Количество товаров возвращено в Google Sheets при отмене менеджером');
                            } else {
                                console.error('Ошибка обновления количества при отмене:', res.statusCode);
                            }
                        });
                    });
                    
                    updateStockReq.on('error', (error) => {
                        console.error('Ошибка запроса обновления количества:', error);
                    });
                    
                    updateStockReq.write(updateStockData);
                    updateStockReq.end();
                }
            } catch (error) {
                console.error('Ошибка обновления количества товаров при отмене менеджером:', error);
            }
        } else if (action === 'transfer') {
            // Заказ передан клиенту
            if (order.status !== 'confirmed') {
                return ctx.answerCbQuery('⚠️ Заказ должен быть сначала подтвержден');
            }
            
            // Проверяем, что это тот менеджер, который подтвердил заказ
            if (order.confirmedBy && order.confirmedBy.toString() !== ctx.from.id.toString()) {
                return ctx.answerCbQuery('Заказ управляется другим менеджером');
            }
            
            order.status = 'transferred';
            order.transferredBy = ctx.from.id;
            order.transferredByUsername = ctx.from.username || ctx.from.first_name;
            order.transferredAt = new Date().toISOString();
            
            // Вычисляем начисление Vape Coins (только за товары, оплаченные деньгами)
            // Формула начисления: price / 10 (за каждые 10 BYN получаем 1 коин)
            let coinsToAdd = 0;
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const paymentMethod = item.paymentMethod || 'money';
                    if (paymentMethod === 'money') {
                        // Формула начисления: price / 10 (18 BYN = 1.8 коинов)
                        const coinsForItem = (item.price * item.quantity) / 10;
                        coinsToAdd += coinsForItem;
                    }
                });
            }
            // Минимум 0 коинов (если все оплачено коинами)
            order.vapeCoinsEarned = Math.max(0, coinsToAdd);
            
            // Сохраняем заказ в БД пользователя и начисляем коины
            if (order.userId && order.userId !== 'unknown' && coinsToAdd > 0) {
                try {
                    // Сохраняем заказ в БД пользователя
                    db.addOrder(order.userId, {
                        id: order.id,
                        date: order.date,
                        status: 'transferred',
                        items: order.items,
                        total: order.total,
                        vapeCoinsSpent: order.vapeCoinsSpent || 0,
                        vapeCoinsEarned: coinsToAdd
                    });
                    
                    // Начисляем коины
                    db.addVapeCoins(order.userId, coinsToAdd, `Заказ #${order.id.slice(-6)}`);
                    console.log(`Начислено ${coinsToAdd} коинов пользователю ${order.userId} за заказ ${order.id}`);
                } catch (error) {
                    console.error('Ошибка при сохранении заказа и начислении коинов в БД:', error);
                }
            }
            
            saveOrders(orders);
            
            ctx.answerCbQuery('✅ Заказ передан клиенту');
            
            // Формируем текст для обновления всех сообщений
            const moscowTime = getMoscowTime();
            const userInfo = order.userId ? `👤 Клиент ID: ${order.userId}${order.userUsername ? ` (@${order.userUsername})` : ''}` : '👤 Клиент ID: не указан';
            // Формируем список товаров для уведомления менеджерам
            const itemsListForManager = order.items.map((item, index) => {
                let itemText = `${index + 1}. ${item.name || 'Товар'}`;
                if (item.flavor) itemText += ` (${item.flavor})`;
                if (item.strength) itemText += ` ${item.strength}`;
                itemText += ` - ${item.quantity || 1} шт.`;
                return itemText;
            }).join('\n');
            
            const transferMessage = `<b>📦 Заказ #${order.id.slice(-6)} передан клиенту</b>\n\n` +
                `<b>Товары:</b>\n${itemsListForManager}\n\n` +
                `${userInfo}\n` +
                `Передал: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${moscowTime.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n` +
                `💰 Начислено Vape Coins: ${coinsToAdd.toFixed(1)} 🪙`;
            
            // Обновляем все сообщения для всех менеджеров
            // Только подтвердивший менеджер может управлять заказом
            await updateOrderMessagesForAllManagers(order, transferMessage, null, order.confirmedBy);
            
            // Отправляем уведомление клиенту
            const deliveryDateText = order.selectedDeliveryDay 
                ? formatMoscowDate(order.selectedDeliveryDay)
                : (order.date ? formatMoscowDate(order.date) : 'сегодня');
            const deliveryTimeText = order.deliveryTime 
                ? (order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime)
                : '';
            const exactTimeText = order.deliveryExactTime ? ` (${order.deliveryExactTime})` : '';
            const locationText = order.deliveryType === 'selfPickup' 
                ? `Точка самовывоза: ${order.pickupLocation || order.location}`
                : `Адрес доставки: ${order.deliveryAddress || order.location}`;
            
            // Формируем список товаров для уведомления клиенту
            const itemsList = order.items.map((item, index) => {
                let itemText = `${index + 1}. ${item.name || 'Товар'}`;
                if (item.flavor) itemText += ` (${item.flavor})`;
                if (item.strength) itemText += ` ${item.strength}`;
                itemText += ` - ${item.quantity || 1} шт.`;
                return itemText;
            }).join('\n');
            
            const coinsMessage = coinsToAdd > 0 ? `\n💰 Вам начислено ${coinsToAdd.toFixed(1)} Vape Coins за заказ!\n` : '';
            const clientNotification = `📦 <b>Ваш заказ #${order.id.slice(-6)} передан!</b>\n\n` +
                `<b>Товары:</b>\n${itemsList}\n\n` +
                `📅 Дата: ${deliveryDateText}\n` +
                `⏰ Время: ${deliveryTimeText}${exactTimeText}\n` +
                `📍 ${locationText}` +
                coinsMessage +
                `\n\nСпасибо за покупку! 🎉`;
            
            await notifyClient(order, 'transferred', clientNotification);
        } else if (action === 'details') {
            const details = formatOrderForManager(order);
            ctx.answerCbQuery();
            ctx.reply(details, { parse_mode: 'HTML' });
        }
    } catch (error) {
        console.error('Error handling callback:', error);
        ctx.answerCbQuery('❌ Произошла ошибка');
    }
});

// Команда для регистрации менеджера (только для администраторов)
bot.command('register', async (ctx) => {
    // ВАЖНО: Только администратор может регистрировать менеджеров
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ У вас нет прав администратора. Только администратор может регистрировать менеджеров.\n\nИспользуйте команду /addmanager для добавления менеджеров.');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Использование: /register <город>\n\nПример: /register mogilev\n\nДоступные города: mogilev, minsk\n\n⚠️ Внимание: Эта команда регистрирует вас как менеджера. Для добавления другого пользователя используйте /addmanager <id> <город>');
    }
    
    const city = args[1].toLowerCase();
    const telegramId = ctx.from.id.toString();
    
    // Проверяем, что город существует
    if (!managers[city] && city !== 'mogilev' && city !== 'minsk' && city !== 'default') {
        return ctx.reply('❌ Неверный город. Доступные города: mogilev, minsk');
    }
    
    if (!managers[city]) {
        managers[city] = [];
    }
    
    if (!managers[city].includes(telegramId)) {
        managers[city].push(telegramId);
        saveManagers(managers);
        ctx.reply(`✅ Вы зарегистрированы как менеджер для города: ${city}`);
    } else {
        ctx.reply(`ℹ️ Вы уже зарегистрированы как менеджер для города: ${city}`);
    }
});

// Команда для администратора: добавить менеджера
bot.command('addmanager', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ У вас нет прав администратора');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Использование: /addmanager <telegram_id> <город>\n\nПример: /addmanager 123456789 mogilev');
    }
    
    const telegramId = args[1];
    const city = args[2].toLowerCase();
    
    if (!managers[city]) {
        managers[city] = [];
    }
    
    if (!managers[city].includes(telegramId)) {
        managers[city].push(telegramId);
        saveManagers(managers);
        ctx.reply(`✅ Менеджер ${telegramId} добавлен для города: ${city}`);
        
        // Уведомляем менеджера, если он есть в боте
        try {
            await bot.telegram.sendMessage(telegramId, `✅ Вы были назначены менеджером для города: ${city}`);
        } catch (e) {
            console.log(`Не удалось уведомить менеджера ${telegramId}:`, e.message);
        }
    } else {
        ctx.reply(`ℹ️ Менеджер ${telegramId} уже зарегистрирован для города: ${city}`);
    }
});

// Команда для администратора: удалить менеджера
bot.command('removemanager', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ У вас нет прав администратора');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Использование: /removemanager <telegram_id> <город>\n\nПример: /removemanager 123456789 mogilev');
    }
    
    const telegramId = args[1];
    const city = args[2].toLowerCase();
    
    if (!managers[city]) {
        return ctx.reply(`❌ Город ${city} не найден`);
    }
    
    const index = managers[city].indexOf(telegramId);
    if (index > -1) {
        managers[city].splice(index, 1);
        saveManagers(managers);
        ctx.reply(`✅ Менеджер ${telegramId} удален из города: ${city}`);
    } else {
        ctx.reply(`❌ Менеджер ${telegramId} не найден в городе: ${city}`);
    }
});

// Команда для администратора: список менеджеров
bot.command('managers', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ У вас нет прав администратора');
    }
    
    let message = '📋 <b>Список менеджеров:</b>\n\n';
    
    Object.keys(managers).forEach(city => {
        if (managers[city].length > 0) {
            message += `<b>${city}:</b>\n`;
            managers[city].forEach(id => {
                message += `  • ${id}\n`;
            });
            message += '\n';
        }
    });
    
    if (message === '📋 <b>Список менеджеров:</b>\n\n') {
        message += 'Нет зарегистрированных менеджеров';
    }
    
    ctx.reply(message, { parse_mode: 'HTML' });
});

// Команда для просмотра заказов
bot.command('orders', async (ctx) => {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    
    if (pendingOrders.length === 0) {
        return ctx.reply('✅ Нет заказов, ожидающих подтверждения');
    }
    
    ctx.reply(`📦 Заказов в ожидании: ${pendingOrders.length}`);
    
    pendingOrders.slice(0, 10).forEach(order => {
        ctx.reply(formatOrderForManager(order), {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Подтвердить', callback_data: `confirm_${order.id}` },
                        { text: '❌ Отклонить', callback_data: `reject_${order.id}` }
                    ]
                ]
            }
        });
    });
});

// Обработка команды /start
bot.command('start', async (ctx) => {
    const firstName = ctx.from?.first_name || 'друг';
    const username = ctx.from?.username || '';
    
    const welcomeMessage = `👋 Привет, ${firstName}!\n\n` +
        'Добро пожаловать в наш Vape app!\n\n' +
        '🎁 У нас вы можете:\n' +
        '• Заказать вейп продукцию\n' +
        '• Накапливать и тратить VapeCoins за покупки\n' +
        '• Повышать свою репутацию\n' +
        '• Получать эксклюзивные предложения\n\n' +
        '🚀 Нажмите кнопку ниже, чтобы открыть каталог!';
    
    // URL мини-приложения (всегда используем правильный URL)
    const WEB_APP_URL = 'https://funny-churros-0055dc.netlify.app';
    
    // Логируем какой URL используется для отладки
    console.log('Using WEB_APP_URL:', WEB_APP_URL);
    
    try {
        await ctx.reply(welcomeMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛍️ Открыть магазин', web_app: { url: WEB_APP_URL } }]
                ]
            }
        });
    } catch (error) {
        console.error('Error sending start message:', error);
    }
});

// Команда помощи
bot.command('help', (ctx) => {
    const isAdminUser = isAdmin(ctx.from.id);
    
    let helpText = '📋 <b>Команды бота:</b>\n\n';
    helpText += '/orders - Показать заказы в ожидании\n';
    
    if (isAdminUser) {
        helpText += '\n<b>Команды администратора:</b>\n';
        helpText += '/register &lt;город&gt; - Зарегистрировать себя как менеджер\n';
        helpText += '/addmanager &lt;id&gt; &lt;город&gt; - Добавить менеджера\n';
        helpText += '/removemanager &lt;id&gt; &lt;город&gt; - Удалить менеджера\n';
        helpText += '/managers - Список всех менеджеров\n';
    }
    
    helpText += '/help - Показать эту справку\n\n';
    helpText += 'Доступные города: mogilev, minsk';
    
    ctx.reply(helpText, { parse_mode: 'HTML' });
});

// Keep-alive endpoint для предотвращения засыпания на бесплатном плане
app.get('/keep-alive', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/orders`);
});

// Webhook endpoint для Telegram
app.post('/webhook', (req, res) => {
        bot.handleUpdate(req.body);
        res.sendStatus(200);
});

// Запуск бота
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER_EXTERNAL_URL;
const webhookUrl = process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/webhook` : null;

if (isProduction && webhookUrl) {
    // Используем webhook для продакшена
    // Сначала удаляем webhook, если он был установлен ранее, чтобы избежать конфликтов
    bot.telegram.deleteWebhook({ drop_pending_updates: true })
        .then(() => {
            console.log('✅ Old webhook removed');
            // Затем устанавливаем новый webhook
            return bot.telegram.setWebhook(webhookUrl);
        })
        .then(() => {
            console.log('🤖 Telegram bot webhook set:', webhookUrl);
        })
        .catch(err => {
            console.error('❌ Error setting webhook:', err);
            // Пытаемся установить webhook напрямую, если удаление не удалось
            bot.telegram.setWebhook(webhookUrl).catch(e => {
                console.error('❌ Failed to set webhook after delete:', e);
            });
        });
} else {
    // Используем polling для разработки
// Сначала удаляем webhook, если он был установлен, чтобы избежать конфликта 409
bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => {
        console.log('✅ Webhook removed, starting polling...');
        return bot.launch();
    })
    .catch(err => {
        // Если удаление webhook не удалось, все равно пытаемся запустить polling
        console.log('⚠️ Webhook removal failed or not needed, trying to start polling...');
        return bot.launch();
    })
    .then(() => {
        console.log('🤖 Telegram bot started (polling mode)');
    })
    .catch(err => {
        console.error('❌ Error starting bot:', err);
        // Не завершаем процесс, чтобы сервер продолжал работать
        console.log('⚠️ Bot failed to start, but server continues running');
    });
}

// Запускаем автоматический ping каждые 10 минут
const http = require('http');
setInterval(() => {
    try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const url = new URL(`${baseUrl}/keep-alive`);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            console.log('Keep-alive ping sent');
        });
        
        req.on('error', (err) => {
            console.log('Keep-alive ping failed (this is ok)');
        });
        
        req.on('timeout', () => {
            req.destroy();
        });
        
        req.end();
    } catch (error) {
        console.log('Keep-alive ping failed (this is ok)');
    }
}, 10 * 60 * 1000); // Каждые 10 минут

// Graceful shutdown
process.once('SIGINT', () => {
    if (!isProduction || !webhookUrl) {
    bot.stop('SIGINT');
    }
    db.closeDatabase();
    process.exit(0);
});
process.once('SIGTERM', () => {
    if (!isProduction || !webhookUrl) {
    bot.stop('SIGTERM');
    }
    db.closeDatabase();
    process.exit(0);
});
