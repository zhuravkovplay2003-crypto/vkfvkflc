const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

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

// Загружаем менеджеров из файла
function loadManagers() {
    try {
        if (fs.existsSync(MANAGERS_FILE)) {
            const data = fs.readFileSync(MANAGERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading managers:', error);
    }
    // Структура по умолчанию
    return {
        'mogilev': [],
        'minsk': [],
        'default': []
    };
}

// Сохраняем менеджеров в файл
function saveManagers(managers) {
    try {
        fs.writeFileSync(MANAGERS_FILE, JSON.stringify(managers, null, 2));
    } catch (error) {
        console.error('Error saving managers:', error);
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
function formatOrderForManager(order) {
    const itemsText = order.items.map(item => {
        let text = `  • ${item.name}`;
        if (item.flavor) text += ` (${item.flavor})`;
        if (item.strength) text += ` ${item.strength}`;
        text += ` x${item.quantity}`;
        if (item.paymentMethod === 'coins') {
            text += ` = ${(item.vapeCoinsPrice * item.quantity).toFixed(1)} 🪙`;
        } else {
            text += ` = ${(item.price * item.quantity).toFixed(2)} BYN`;
        }
        return text;
    }).join('\n');
    
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
        
        if (deliveryDateOnly.getTime() === tomorrow.getTime()) {
            dateInfo = '\n📅 <b>Дата доставки: Завтра</b>';
        } else {
            dateInfo = `\n📅 <b>Дата доставки: ${deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b>`;
        }
    }
    
    const timeInfo = order.deliveryTime 
        ? `\n⏰ Время: ${order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime}${order.deliveryExactTime ? ` (${order.deliveryExactTime})` : ''}`
        : '';
    
    return `📦 <b>Новый заказ #${order.id.slice(-6)}</b>\n\n` +
           `${deliveryInfo}${dateInfo}${timeInfo}\n\n` +
           `<b>Товары:</b>\n${itemsText}\n\n` +
           `<b>Итого:</b> ${totalText}\n\n` +
           `👤 Клиент ID: ${order.userId || 'не указан'}`;
}

// API endpoint для приема заказов от клиентского приложения
app.post('/api/orders', (req, res) => {
    try {
        const orderData = req.body;
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Определяем дату заказа
        let orderDate;
        console.log('Order data received:', {
            deliveryTime: orderData.deliveryTime,
            selectedDeliveryDay: orderData.selectedDeliveryDay,
            deliveryExactTime: orderData.deliveryExactTime
        });
        
        if (orderData.selectedDeliveryDay) {
            // Приоритет: selectedDeliveryDay
            orderDate = new Date(orderData.selectedDeliveryDay + 'T12:00:00').toISOString();
            console.log('Using selectedDeliveryDay:', orderDate);
        } else if (orderData.deliveryTime && orderData.deliveryTime.includes('|')) {
            // Если deliveryTime содержит дату (формат 'YYYY-MM-DD|HH:MM-HH:MM')
            const [dateStr] = orderData.deliveryTime.split('|');
            orderDate = new Date(dateStr + 'T12:00:00').toISOString();
            console.log('Using deliveryTime date:', orderDate);
        } else {
            // Иначе используем текущую дату
            orderDate = new Date().toISOString();
            console.log('Using current date:', orderDate);
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
            userId: orderData.userId || 'unknown'
        };
        
        orders.push(order);
        saveOrders(orders);
        
        // Определяем город и отправляем заказ менеджерам
        const city = getCityFromLocation(order.location);
        const managerIds = managers[city] || managers['default'] || [];
        
        console.log(`Sending order to managers. City: ${city}, Managers: ${managerIds.length}`);
        
        if (managerIds.length > 0) {
            let sentCount = 0;
            managerIds.forEach(managerId => {
                bot.telegram.sendMessage(managerId, formatOrderForManager(order), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подтвердить', callback_data: `confirm_${order.id}` },
                                { text: '❌ Отклонить', callback_data: `reject_${order.id}` }
                            ],
                            [
                                { text: '📋 Детали', callback_data: `details_${order.id}` }
                            ]
                        ]
                    }
                }).then(() => {
                    sentCount++;
                    console.log(`Order sent to manager ${managerId} successfully`);
                }).catch(err => {
                    console.error(`Error sending to manager ${managerId}:`, err.message);
                });
            });
            console.log(`Order notification sent to ${sentCount} managers`);
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
            order: order
        });
    } else {
        res.status(404).json({ success: false, error: 'Order not found' });
    }
});

// API для получения всех заказов (для админа)
app.get('/api/orders', (req, res) => {
    res.json({ success: true, orders: orders });
});

// API для добавления менеджера
app.post('/api/managers', (req, res) => {
    try {
        const { city, telegramId } = req.body;
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
        console.log('Total orders:', orders.length);
        console.log('Order IDs:', orders.map(o => o.id));
        
        const order = orders.find(o => o.id === orderId);
        
        if (!order) {
            console.error('Order not found:', orderId);
            return ctx.answerCbQuery('❌ Заказ не найден');
        }
        
        // Проверяем, не обработан ли уже заказ другим менеджером
        if (order.status !== 'pending') {
            if (order.status === 'confirmed' || order.status === 'transferred') {
                return ctx.answerCbQuery('⚠️ Заказ уже подтвержден другим менеджером');
            } else if (order.status === 'rejected') {
                return ctx.answerCbQuery('⚠️ Заказ уже отклонен другим менеджером');
            }
        }
        
        if (action === 'confirm') {
            order.status = 'confirmed';
            order.confirmedBy = ctx.from.id;
            order.confirmedByUsername = ctx.from.username || ctx.from.first_name;
            order.confirmedAt = new Date().toISOString();
            
            saveOrders(orders);
            
            ctx.answerCbQuery('Заказ подтвержден');
            ctx.editMessageText(
                `<b>Заказ #${order.id.slice(-6)} подтвержден</b>\n\n` +
                `Подтвердил: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📦 Заказ передан', callback_data: `transfer_${order.id}` }
                            ]
                        ]
                    }
                }
            );
        } else if (action === 'reject') {
            order.status = 'rejected';
            order.rejectedBy = ctx.from.id;
            order.rejectedByUsername = ctx.from.username || ctx.from.first_name;
            order.rejectedAt = new Date().toISOString();
            
            saveOrders(orders);
            
            ctx.answerCbQuery('Заказ отклонен');
            ctx.editMessageText(
                `<b>Заказ #${order.id.slice(-6)} отклонен</b>\n\n` +
                `Отклонил: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
            );
        } else if (action === 'transfer') {
            // Заказ передан клиенту
            order.status = 'transferred';
            order.transferredBy = ctx.from.id;
            order.transferredByUsername = ctx.from.username || ctx.from.first_name;
            order.transferredAt = new Date().toISOString();
            
            saveOrders(orders);
            
            ctx.answerCbQuery('Заказ передан клиенту');
            ctx.editMessageText(
                `<b>Заказ #${order.id.slice(-6)} передан клиенту</b>\n\n` +
                `Передал: ${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
            );
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

// Команда для регистрации менеджера (самостоятельная регистрация)
bot.command('register', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Использование: /register <город>\n\nПример: /register mogilev\n\nДоступные города: mogilev, minsk');
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

// Команда помощи
bot.command('help', (ctx) => {
    const isAdminUser = isAdmin(ctx.from.id);
    
    let helpText = '📋 <b>Команды бота:</b>\n\n';
    helpText += '/register &lt;город&gt; - Зарегистрироваться как менеджер\n';
    helpText += '/orders - Показать заказы в ожидании\n';
    
    if (isAdminUser) {
        helpText += '\n<b>Команды администратора:</b>\n';
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
    bot.telegram.setWebhook(webhookUrl).then(() => {
        console.log('🤖 Telegram bot webhook set:', webhookUrl);
    }).catch(err => {
        console.error('❌ Error setting webhook:', err);
    });
} else {
    // Используем polling для разработки
    bot.launch().then(() => {
        console.log('🤖 Telegram bot started (polling mode)');
    }).catch(err => {
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
});
process.once('SIGTERM', () => {
    if (!isProduction || !webhookUrl) {
        bot.stop('SIGTERM');
    }
});

