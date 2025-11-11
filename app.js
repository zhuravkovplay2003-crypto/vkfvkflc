// Telegram Web App - VapeApp
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

// ID администраторов
const ADMIN_IDS = [8248768964];

// Username бота для реферальных ссылок (формат: без @, например: "VapeBelShop_bot")
const BOT_USERNAME = 'VapeBelShop_bot';

// Состояние приложения
let cart = [];
let favorites = [];
let orders = []; // История заказов
let stamps = 0; // Текущее количество штампов (печатей)
let completedStampSets = 0; // Количество собранных полных наборов из 10 штампов
let partialItemsProgress = 0; // Прогресс к следующему штампу (0-1, где 1 = 2 товара = 1 штамп)
let vapeCoins = 0; // Количество Vape Coins
let vapeCoinsHistory = []; // История транзакций Vape Coins
let currentCategory = 'all';
let currentPage = 'catalog';
let sortOrder = null;
let lastCatalogClickTime = 0; // Время последнего клика на вкладку "Ассортимент"
let favoritesScrollPosition = 0; // Позиция скролла страницы избранного
let currentLocation = 'Минск, ст. м. Грушевка';
let viewingProduct = null;
let ageVerified = false;
let favoritesCategory = 'all'; // Категория в избранном: 'all', 'liquids', 'accessories', 'disposable', 'vape'
let deliveryType = 'selfPickup'; // 'selfPickup' или 'delivery'
let deliveryTime = null; // Время доставки в формате 'YYYY-MM-DD|HH:MM-HH:MM'
let deliveryExactTime = null; // Точное время доставки в формате 'HH:MM'
let selectedDeliveryDay = null; // Выбранный день доставки в формате 'YYYY-MM-DD'
let deliveryAddress = ''; // Адрес доставки для курьерской доставки
let selectedPickupLocation = 'Минск, ст. м. Грушевка'; // Выбранная точка самовывоза в корзине
let selectedCity = ''; // Выбранный город для доставки
let viewedProducts = []; // Недавно просмотренные товары
let darkMode = false; // Тема приложения (темная/светлая)
let pageHistory = []; // История навигации по страницам
let tabHistory = {}; // История навигации для каждой вкладки отдельно {tabName: [pages]}
let isAddingToCart = false; // Флаг блокировки для предотвращения дублирования при быстром нажатии
let referrals = []; // Список рефералов
let referralsData = { total: 0, active: 0 }; // Статистика рефералов
let activePageAnimationTimeout = null; // Таймер для анимации страницы
let orderStatusCheckIntervals = {}; // Интервалы для проверки статусов заказов
let backButtonPressCount = 0; // Счетчик нажатий кнопки "Назад"

// URL сервера (измените на ваш адрес сервера)
// const SERVER_URL = 'http://localhost:3000'; // Для разработки
const SERVER_URL = 'https://vkfvkflc.onrender.com'; // Render.com сервер

// Делаем SERVER_URL доступным глобально для userData.js
window.SERVER_URL = SERVER_URL;

// Функция для синхронизации корзины с сервером
async function syncCartToServer() {
    if (!window.userDataManager || !window.userDataManager.syncCart) {
        // Если userDataManager еще не загружен, просто сохраняем локально
        localStorage.setItem('cart', JSON.stringify(cart));
        return;
    }
    
    try {
        // Синхронизируем с сервером через userDataManager
        await window.userDataManager.syncCart(cart);
    } catch (error) {
        console.error('Ошибка при синхронизации корзины:', error);
        // В случае ошибки сохраняем локально
        localStorage.setItem('cart', JSON.stringify(cart));
    }
}

// Функция для синхронизации коинов с сервером
async function syncVapeCoinsToServer(amount, reason = '') {
    if (window.userDataManager && window.userDataManager.addVapeCoins) {
        try {
            const newBalance = await window.userDataManager.addVapeCoins(amount, reason);
            vapeCoins = newBalance;
            localStorage.setItem('vapeCoins', vapeCoins.toString());
            return newBalance;
        } catch (error) {
            console.error('Ошибка синхронизации коинов:', error);
            // Fallback на локальное сохранение
            vapeCoins += amount;
            localStorage.setItem('vapeCoins', vapeCoins.toString());
            return vapeCoins;
        }
    } else {
        // Fallback на локальное сохранение
        vapeCoins += amount;
        localStorage.setItem('vapeCoins', vapeCoins.toString());
        return vapeCoins;
    }
}

// Функция для синхронизации штампов с сервером
async function syncStampsToServer(newStamps) {
    console.log('🔄 Синхронизируем штампы с сервером, newStamps:', newStamps);
    
    if (window.userDataManager && window.userDataManager.getUserId) {
        const userId = window.userDataManager.getUserId();
        if (userId) {
            try {
                // ВАЖНО: Используем правильный URL сервера (не window.location.origin)
                const apiUrl = SERVER_URL || 'https://vkfvkflc.onrender.com';
                console.log('📡 Отправляем штампы на сервер:', `${apiUrl}/api/user/${userId}/stamps`);
                const response = await fetch(`${apiUrl}/api/user/${userId}/stamps`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ stamps: newStamps })
                });
                
                if (response.ok) {
                    console.log('✅ Штампы синхронизированы с сервером');
                    stamps = newStamps % 10;
                    completedStampSets = Math.floor(newStamps / 10);
                    localStorage.setItem('stamps', newStamps.toString());
                } else {
                    const errorText = await response.text();
                    console.error('❌ Ошибка синхронизации штампов:', response.status, errorText);
                    // Fallback на локальное сохранение
                    stamps = newStamps % 10;
                    completedStampSets = Math.floor(newStamps / 10);
                    localStorage.setItem('stamps', newStamps.toString());
                }
            } catch (error) {
                console.error('❌ Ошибка синхронизации штампов:', error);
                // Fallback на локальное сохранение
                stamps = newStamps % 10;
                completedStampSets = Math.floor(newStamps / 10);
                localStorage.setItem('stamps', newStamps.toString());
            }
        } else {
            console.error('❌ userId не определен для синхронизации штампов');
        }
    } else {
        console.warn('⚠️ userDataManager не доступен, сохраняем локально');
        // Fallback на локальное сохранение
        stamps = newStamps % 10;
        completedStampSets = Math.floor(newStamps / 10);
        localStorage.setItem('stamps', newStamps.toString());
    }
}

// Функция для загрузки корзины с сервера при старте
async function loadCartFromServer() {
    if (!window.userDataManager || !window.userDataManager.getUserData) {
        // Если userDataManager еще не загружен, загружаем из localStorage
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                cart = JSON.parse(savedCart);
            } catch (e) {
                cart = [];
            }
        }
        return;
    }
    
    try {
        const userData = await window.userDataManager.getUserData();
        // ВАЖНО: Загружаем корзину с сервера даже если она пустая, чтобы синхронизировать состояние
        if (userData && userData.cart !== undefined) {
            // Если cart есть в данных пользователя (даже если пустой массив), используем его
            cart = Array.isArray(userData.cart) ? userData.cart : [];
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartBadge();
        } else {
            // Если данных нет на сервере, загружаем из localStorage и синхронизируем на сервер
            const savedCart = localStorage.getItem('cart');
            if (savedCart) {
                try {
                    cart = JSON.parse(savedCart);
                    // Синхронизируем локальную корзину на сервер
                    await syncCartToServer();
                } catch (e) {
                    cart = [];
                    // Синхронизируем пустую корзину на сервер
                    await syncCartToServer();
                }
            } else {
                // Если нет данных ни на сервере, ни в localStorage, создаем пустую корзину и синхронизируем
                cart = [];
                await syncCartToServer();
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке корзины с сервера:', error);
        // В случае ошибки загружаем из localStorage
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                cart = JSON.parse(savedCart);
            } catch (e) {
                cart = [];
            }
        }
    }
}

// Получить цвета в зависимости от темы
function getThemeColors() {
    if (darkMode) {
        return {
            bg: '#1a1a1a',
            bgSecondary: '#2a2a2a',
            bgCard: '#2a2a2a',
            text: '#ffffff',
            textSecondary: '#b0b0b0',
            border: '#3a3a3a'
        };
    } else {
        return {
            bg: '#f5f5f5',
            bgSecondary: '#ffffff',
            bgCard: '#ffffff',
            text: '#000000',
            textSecondary: '#666666',
            border: '#e5e5e5'
        };
    }
}

// ВАЖНО: Определяем verifyAge СРАЗУ и делаем глобальной
function verifyAge(isAdult) {
    console.log('verifyAge called:', isAdult);
    try {
        if (isAdult) {
            ageVerified = true;
            localStorage.setItem('ageVerified', 'true');
            
            // Скрываем окно проверки возраста
            const ageVerification = document.getElementById('age-verification');
            if (ageVerification) {
                ageVerification.classList.remove('show');
            }
            
            // Показываем основной контент
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.classList.remove('hidden');
                showPage('catalog');
            // Инициализируем SVG иконки после показа основного контента
            setTimeout(() => {
                initSVGIcons();
            }, 150);
            }
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            // После подтверждения возраста всегда открываем выбор точки самовывоза
            setTimeout(() => {
                console.log('Открываем выбор точки самовывоза после подтверждения возраста...');
                selectPickupLocation();
            }, 300); // Небольшая задержка для плавности
            
        } else {
            if (tg && tg.showAlert) {
                tg.showAlert('Доступ запрещен. Продажа никотинсодержащей продукции лицам младше 18 лет запрещена.');
                tg.close();
            }
        }
    } catch (error) {
        console.error('Error in verifyAge:', error);
        showMainContent();
    }
}

// Делаем функцию глобальной СРАЗУ
window.verifyAge = verifyAge;

// Каталог товаров (загружается из Google таблиц)
let products = [];

// ===== НАСТРОЙКИ GOOGLE ТАБЛИЦ (основной источник данных) =====
const GOOGLE_SHEETS_CONFIG = {
    // ID таблицы (одна таблица для обеих листов)
    sheetId: '16IWmjfm__yJ2Ryqhm97vjJx-gKVcfkTANdq2lkojmvw',
    
    // ID листов (gid) - разные листы в одной таблице
    productsGid: '0',           // Лист "Товары" (gid=0)
    variantsGid: '1804830457',  // Лист "Варианты товаров" (gid=1804830457)
    
    // API ключ для Google Sheets API (опционально, для получения изображений из ячеек)
    apiKey: 'AIzaSyAJaShY7Th_2yrG4jXEUS2xIkfl3Glx6x8'
};

// Функция для обработки ссылок на изображения
// Если в таблице указан номер (1, 2, 3...), формирует путь к локальному изображению /images/1.jpg
function processImageUrl(url) {
    if (!url) return null;
    
    const urlStr = String(url).trim();
    if (!urlStr) return null;
    
    // Если это полный URL (http/https), возвращаем как есть
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return urlStr;
    }
    
    // Если это Base64 изображение, возвращаем как есть
    if (urlStr.startsWith('data:image/')) {
        return urlStr;
    }
    
    // Проверяем, является ли значение числом (номером изображения)
    const cleanNumber = urlStr.replace(/\s/g, '');
    if (/^\d+$/.test(cleanNumber)) {
        const imageNumber = parseInt(cleanNumber, 10);
        // Пробуем разные варианты расширений (.jpg, .JPG)
        // Сначала пробуем .JPG (большими буквами), так как большинство файлов имеют такое расширение
        return `/images/${imageNumber}.JPG`;
    }
    
    // Если это относительный путь, возвращаем как есть
    if (urlStr.startsWith('/')) {
        return urlStr;
    }
    
    console.warn('⚠️ Неизвестный формат URL изображения:', urlStr.substring(0, 50));
    return urlStr;
}

// Функция для парсинга CSV
function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const parseCSVLine = (line) => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    };
    
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = (values[index] || '').replace(/^"|"$/g, '').trim();
            });
            if (Object.values(row).some(v => v !== '')) {
                data.push(row);
            }
        }
    }
    
    return data;
}

// Загрузка данных из Google таблиц
async function loadProductsFromGoogleSheets() {
    try {
        const sheetId = GOOGLE_SHEETS_CONFIG.sheetId;
        const productsGid = GOOGLE_SHEETS_CONFIG.productsGid || '0';
        const variantsGid = GOOGLE_SHEETS_CONFIG.variantsGid || '0';
        
        const productsUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${productsGid}`;
        const variantsUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${variantsGid}`;
        
        console.log('Загрузка товаров из Google таблиц...');
        
        const [productsResponse, variantsResponse] = await Promise.all([
            fetch(productsUrl).catch(err => {
                console.error('Ошибка загрузки таблицы товаров:', err);
                return null;
            }),
            fetch(variantsUrl).catch(err => {
                console.error('Ошибка загрузки таблицы вариантов:', err);
                return null;
            })
        ]);
        
        if (!productsResponse || !productsResponse.ok) {
            throw new Error(`Ошибка загрузки товаров: ${productsResponse?.status || 'нет ответа'}`);
        }
        
        const productsText = await productsResponse.text();
        const variantsText = variantsResponse && variantsResponse.ok ? await variantsResponse.text() : '';
        
        const productsData = parseCSV(productsText);
        const variantsData = variantsText ? parseCSV(variantsText) : [];
        
        console.log('Загружено товаров:', productsData.length);
        console.log('Загружено вариантов:', variantsData.length);
        
        products = transformProductsData(productsData, variantsData);
        console.log('Товары преобразованы:', products.length);
        
        return products;
        
    } catch (error) {
        console.error('Ошибка загрузки товаров из Google таблиц:', error);
        products = [];
        return products;
    }
}

// Преобразование данных из таблиц в формат приложения
function transformProductsData(productsData, variantsData) {
    const result = [];
    
    const variantsByProductId = {};
    variantsData.forEach(variant => {
        const productId = parseInt(variant['ID товара'] || variant['ID']) || 0;
        if (!variantsByProductId[productId]) {
            variantsByProductId[productId] = [];
        }
        variantsByProductId[productId].push(variant);
    });
    
    productsData.forEach(productRow => {
        const productId = parseInt(productRow['ID'] || productRow['id']) || 0;
        if (!productId) return;
        
        const product = {
            id: productId,
            name: (productRow['Название'] || productRow['name'] || '').trim(),
            category: (productRow['Категория'] || productRow['category'] || '').toLowerCase().trim(),
            price: parseFloat(productRow['Цена'] || productRow['price'] || 0),
            description: (productRow['Описание'] || productRow['description'] || '').trim(),
            imageUrl: (() => {
                const url = (productRow['URL дефолтное фото'] || productRow['imageUrl'] || productRow['URL фото'] || '').trim();
                if (url) {
                    return processImageUrl(url);
                }
                return null;
            })(),
            inStock: (productRow['В наличии'] || productRow['inStock'] || '').toString().toLowerCase() === 'да' || 
                    (productRow['В наличии'] || productRow['inStock'] || '').toString().toLowerCase() === 'true',
            quantity: parseInt(productRow['Количество'] || productRow['quantity'] || 0) || 0
        };
        
        const variants = variantsByProductId[productId] || [];
        const strengths = new Set();
        const flavors = new Set();
        const resistances = new Set();
        const colors = new Set();
        const flavorImages = {};
        const resistanceImages = {};
        const colorImages = {};
        
        // Объект для хранения количества товара на каждой точке самовывоза
        // Формат: { "Минск, ст. м. Грушевка": 5, "Минск, ст. м. Площадь Победы": 0, ... }
        const stockByLocation = {};
        
        // Объект для хранения количества товара по вкусам и точкам самовывоза
        // Формат: { "Вкус1": { "Минск, ст. м. Грушевка": 5, ... }, ... }
        const stockByFlavorAndLocation = {};
        
        variants.forEach(variant => {
            const крепость = (variant['Крепость'] || '').trim();
            const сопротивление = (variant['Сопротивление'] || '').trim();
            const вкус = (variant['Вкус'] || '').trim();
            const цвет = (variant['Цвет'] || '').trim();
            let urlФото = (variant['URL фото'] || '').trim();
            
            if (urlФото) {
                urlФото = processImageUrl(urlФото);
            }
            
            if (!urlФото && product.imageUrl) {
                urlФото = product.imageUrl;
            }
            
            // Читаем колонки с точками самовывоза из варианта
            // Ищем все колонки, которые не являются стандартными (ID товара, Крепость, Сопротивление, Вкус, Цвет, URL фото)
            const standardColumns = ['ID товара', 'ID', 'Крепость', 'Сопротивление', 'Вкус', 'Цвет', 'URL фото'];
            Object.keys(variant).forEach(columnName => {
                if (!standardColumns.includes(columnName) && columnName.trim() !== '') {
                    // Это колонка с точкой самовывоза
                    const locationName = columnName.trim();
                    const quantity = parseInt(variant[columnName] || '0', 10) || 0;
                    
                    // Если для этой точки еще не было значения, или текущее значение больше
                    // (берем максимальное количество из всех вариантов для этой точки)
                    if (!stockByLocation[locationName] || quantity > stockByLocation[locationName]) {
                        stockByLocation[locationName] = quantity;
                    }
                    
                    // Сохраняем количество по вкусам и точкам
                    // Если есть вкус, сохраняем для этого вкуса
                    if (вкус && вкус !== '-' && вкус !== '') {
                        if (!stockByFlavorAndLocation[вкус]) {
                            stockByFlavorAndLocation[вкус] = {};
                        }
                        // Берем максимальное количество для этого вкуса на этой точке
                        if (!stockByFlavorAndLocation[вкус][locationName] || quantity > stockByFlavorAndLocation[вкус][locationName]) {
                            stockByFlavorAndLocation[вкус][locationName] = quantity;
                        }
                    }
                }
            });
            
            if (крепость && крепость !== '-' && крепость !== '') {
                strengths.add(крепость);
                if (вкус && вкус !== '-' && вкус !== '') {
                    flavors.add(вкус);
                    if (urlФото) {
                        flavorImages[вкус] = urlФото;
                    }
                }
            }
            
            if (сопротивление && сопротивление !== '-' && сопротивление !== '') {
                resistances.add(сопротивление);
                if (urlФото) {
                    resistanceImages[сопротивление] = urlФото;
                }
            }
            
            if (вкус && вкус !== '-' && вкус !== '' && !крепость && !сопротивление) {
                flavors.add(вкус);
                if (urlФото) {
                    flavorImages[вкус] = urlФото;
                }
            }
            
            if (цвет && цвет !== '-' && цвет !== '') {
                colors.add(цвет);
                if (urlФото) {
                    colorImages[цвет] = urlФото;
                }
            }
        });
        
        // Сохраняем информацию о количестве на точках самовывоза
        if (Object.keys(stockByLocation).length > 0) {
            product.stockByLocation = stockByLocation;
        }
        
        // Сохраняем информацию о количестве по вкусам и точкам
        if (Object.keys(stockByFlavorAndLocation).length > 0) {
            product.stockByFlavorAndLocation = stockByFlavorAndLocation;
        }
        
        if (strengths.size > 0) product.strengths = Array.from(strengths);
        if (flavors.size > 0) product.flavors = Array.from(flavors);
        if (resistances.size > 0) product.resistances = Array.from(resistances);
        if (colors.size > 0) product.colors = Array.from(colors);
        if (Object.keys(flavorImages).length > 0) product.flavorImages = flavorImages;
        if (Object.keys(resistanceImages).length > 0) product.resistanceImages = resistanceImages;
        if (Object.keys(colorImages).length > 0) product.colorImages = colorImages;
        
        result.push(product);
    });
    
    return result;
}

// Обновление отображения выбранной точки самовывоза в шапке
function updatePickupLocationDisplay() {
    const locationText = document.getElementById('pickup-location-text');
    if (locationText) {
        if (selectedPickupLocation) {
            // Обрезаем текст если слишком длинный, но добавляем отступ справа
            const shortLocation = selectedPickupLocation.length > 20 
                ? selectedPickupLocation.substring(0, 17) + '...' 
                : selectedPickupLocation;
            // Убираем эмодзи и добавляем правильные отступы
            locationText.textContent = shortLocation;
            locationText.style.paddingRight = '8px';
            locationText.style.wordBreak = 'break-word';
            locationText.style.overflowWrap = 'break-word';
        } else {
            locationText.textContent = 'Выберите точку';
        }
    }
    
    // Обновляем правую часть навигации для каталога и страницы товара
    if (currentPage === 'catalog' || currentPage === 'product') {
        const navRightContent = document.getElementById('nav-right-content');
        if (navRightContent) {
            if (selectedPickupLocation) {
                // Показываем адрес с ограничением ширины для статичного размера
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center; flex: 1; min-width: 0; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${selectedPickupLocation}</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.style.minWidth = '180px';
                navRightContent.style.maxWidth = '220px';
                navRightContent.style.width = 'auto';
                navRightContent.style.flex = '0 0 auto';
                navRightContent.onclick = () => selectPickupLocation();
            } else {
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; justify-content: center; width: 100%;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center;">Выберите точку</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.onclick = () => selectPickupLocation();
            }
        }
    }
}

// Показ сообщения о необходимости выбора точки самовывоза
function showLocationRequiredMessage() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    container.className = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.padding = '40px 20px';
    container.style.background = '#f5f5f5';
    container.style.minHeight = '400px';
    container.style.textAlign = 'center';
    
    container.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px;">📍</div>
        <div style="font-size: 24px; font-weight: 700; color: #333; margin-bottom: 12px;">
            Выберите точку самовывоза
        </div>
        <div style="font-size: 16px; color: #666; margin-bottom: 30px; line-height: 1.5;">
            Чтобы увидеть актуальный ассортимент товаров,<br>выберите точку самовывоза в шапке
        </div>
        <button onclick="selectPickupLocation()" style="
            background: #007AFF;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            padding: 14px 28px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,122,255,0.3);
        ">
            Выбрать точку
        </button>
    `;
}

// Функция для проверки наличия товара на выбранной точке самовывоза
function isProductInStockAtLocation(product, location) {
    // Если товар не в наличии вообще, возвращаем false
    if (product.inStock === false) {
        return false;
    }
    
    // Если нет информации о количестве на точках, используем общее количество
    if (!product.stockByLocation || Object.keys(product.stockByLocation).length === 0) {
        return product.quantity === undefined || product.quantity > 0;
    }
    
    // Если точка не указана, проверяем общее количество
    if (!location) {
        return product.quantity === undefined || product.quantity > 0;
    }
    
    // Проверяем количество на конкретной точке
    const quantityAtLocation = product.stockByLocation[location];
    
    // Если для этой точки нет данных, считаем что товар есть (используем общее количество)
    if (quantityAtLocation === undefined) {
        return product.quantity === undefined || product.quantity > 0;
    }
    
    // Товар есть, если количество больше 0
    return quantityAtLocation > 0;
}

// Получить список точек, где есть товар
function getLocationsWithStock(product) {
    if (!product || product.inStock === false) {
        return [];
    }
    
    // Если нет информации о количестве на точках, возвращаем пустой массив
    if (!product.stockByLocation || Object.keys(product.stockByLocation).length === 0) {
        return [];
    }
    
    // Возвращаем список точек, где количество > 0
    return Object.keys(product.stockByLocation).filter(location => {
        const quantity = product.stockByLocation[location];
        return quantity !== undefined && quantity > 0;
    });
}

// Получить город из адреса
function getCityFromLocation(location) {
    if (!location) return null;
    if (location.startsWith('Минск')) return 'Минск';
    if (location.startsWith('Могилёв') || location.startsWith('Могилев')) return 'Могилёв';
    return null;
}

// Проверить наличие конкретного вкуса на конкретной точке
function isFlavorInStockAtLocation(product, flavor, location) {
    if (!product || !flavor || !location) return false;
    
    // Если товар не в наличии вообще, возвращаем false
    if (product.inStock === false) {
        return false;
    }
    
    // Сначала проверяем наличие конкретного вкуса на конкретной точке
    if (product.stockByFlavorAndLocation && product.stockByFlavorAndLocation[flavor]) {
        const quantityAtLocation = product.stockByFlavorAndLocation[flavor][location];
        if (quantityAtLocation !== undefined) {
            return quantityAtLocation > 0;
        }
    }
    
    // Если нет информации о количестве на точках, используем общее количество
    if (!product.stockByLocation || Object.keys(product.stockByLocation).length === 0) {
        return product.quantity === undefined || product.quantity > 0;
    }
    
    // Проверяем количество на конкретной точке (общее для товара)
    const quantityAtLocation = product.stockByLocation[location];
    
    // Если для этой точки нет данных, считаем что товар есть (используем общее количество)
    if (quantityAtLocation === undefined) {
        return product.quantity === undefined || product.quantity > 0;
    }
    
    // Товар есть, если количество больше 0
    return quantityAtLocation > 0;
}

// Получить список точек, где есть конкретный вкус
function getLocationsWithFlavorStock(product, flavor) {
    if (!product || !flavor || product.inStock === false) {
        return [];
    }
    
    // Сначала проверяем наличие конкретного вкуса на точках
    if (product.stockByFlavorAndLocation && product.stockByFlavorAndLocation[flavor]) {
        return Object.keys(product.stockByFlavorAndLocation[flavor]).filter(location => {
            const quantity = product.stockByFlavorAndLocation[flavor][location];
            return quantity !== undefined && quantity > 0;
        });
    }
    
    // Если нет информации о количестве на точках, возвращаем пустой массив
    if (!product.stockByLocation || Object.keys(product.stockByLocation).length === 0) {
        return [];
    }
    
    // Возвращаем список точек, где количество > 0 (общее для товара)
    return Object.keys(product.stockByLocation).filter(location => {
        const quantity = product.stockByLocation[location];
        return quantity !== undefined && quantity > 0;
    });
}

// Получить список точек, где есть конкретный вкус, отфильтрованный по городу
function getLocationsWithFlavorStockByCity(product, flavor, city) {
    const allLocations = getLocationsWithFlavorStock(product, flavor);
    if (!city) return allLocations;
    
    // Фильтруем по городу
    return allLocations.filter(location => {
        if (city === 'Минск') {
            return location.includes('Минск');
        } else if (city === 'Могилёв' || city === 'Могилев') {
            return location.includes('Могилёв') || location.includes('Могилев');
        }
        return true;
    });
}

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

function formatMoscowDate(dateString) {
    const date = new Date(dateString);
    // Добавляем 3 часа для московского времени
    const moscowOffset = 3 * 60 * 60 * 1000;
    const moscowDate = new Date(date.getTime() + moscowOffset);
    const year = moscowDate.getUTCFullYear();
    const month = String(moscowDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(moscowDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

// Функция для показа информации о синхронизации (для отладки)
function showDebugInfo() {
    // Пытаемся получить userId разными способами
    let userId = null;
    let userIdSource = '';
    
    // ВАЖНО: Используем window.Telegram.WebApp, а не window.tg
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        userId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
        userIdSource = 'window.Telegram.WebApp.initDataUnsafe.user.id';
    } else if (window.tg?.initDataUnsafe?.user?.id) {
        userId = window.tg.initDataUnsafe.user.id.toString();
        userIdSource = 'window.tg.initDataUnsafe.user.id';
    } else if (window.tg?.initData?.user?.id) {
        userId = window.tg.initData.user.id.toString();
        userIdSource = 'window.tg.initData.user.id';
    }
    
    const userDataManagerExists = typeof window.userDataManager !== 'undefined';
    const getUserDataExists = typeof window.userDataManager?.getUserData === 'function';
    const getUserIdExists = typeof window.userDataManager?.getUserId === 'function';
    
    let info = '🔍 ИНФОРМАЦИЯ О СИНХРОНИЗАЦИИ\n\n';
    
    // Проверяем Telegram Web App
    info += `📱 Telegram Web App:\n`;
    info += `  window.Telegram: ${typeof window.Telegram !== 'undefined' ? '✅' : '❌'}\n`;
    info += `  window.Telegram.WebApp: ${window.Telegram?.WebApp ? '✅' : '❌'}\n`;
    info += `  window.tg (локальная переменная): ${tg ? '✅' : '❌'}\n`;
    if (window.Telegram?.WebApp) {
        info += `  window.Telegram.WebApp.initDataUnsafe: ${window.Telegram.WebApp.initDataUnsafe ? '✅' : '❌'}\n`;
        if (window.Telegram.WebApp.initDataUnsafe) {
            info += `  window.Telegram.WebApp.initDataUnsafe.user: ${window.Telegram.WebApp.initDataUnsafe.user ? '✅' : '❌'}\n`;
        }
    }
    info += `\n`;
    
    // User ID
    if (userId) {
        info += `✅ User ID: ${userId}\n`;
        info += `   Источник: ${userIdSource}\n\n`;
    } else {
        info += `❌ User ID: НЕ ОПРЕДЕЛЕН\n\n`;
        info += `⚠️ ВАЖНО: Без User ID синхронизация НЕ РАБОТАЕТ!\n`;
        info += `Убедитесь, что:\n`;
        info += `1. Приложение открыто в Telegram (не в браузере)\n`;
        info += `2. Используется последняя версия Telegram\n`;
        info += `3. Разрешен доступ к данным пользователя\n\n`;
    }
    
    info += `📦 userDataManager: ${userDataManagerExists ? '✅ Загружен' : '❌ НЕ загружен'}\n`;
    info += `📦 getUserData: ${getUserDataExists ? '✅ Доступна' : '❌ НЕ доступна'}\n`;
    info += `📦 getUserId: ${getUserIdExists ? '✅ Доступна' : '❌ НЕ доступна'}\n\n`;
    
    // Проверяем данные в localStorage
    const localCart = localStorage.getItem('cart');
    const localCoins = localStorage.getItem('vapeCoins');
    const localStamps = localStorage.getItem('stamps');
    
    info += `🛒 Корзина (localStorage): ${localCart ? JSON.parse(localCart).length + ' товаров' : 'пусто'}\n`;
    info += `💰 Коины (localStorage): ${localCoins || 0}\n`;
    info += `🎫 Штампы (localStorage): ${localStamps || 0}\n\n`;
    
    // Пытаемся получить данные с сервера
    if (userId && userDataManagerExists && getUserDataExists) {
        info += '📡 Проверяю данные на сервере...\n';
        window.userDataManager.getUserData().then(userData => {
            if (userData) {
                let serverInfo = '✅ ДАННЫЕ С СЕРВЕРА:\n\n';
                serverInfo += `💰 Коины: ${userData.vapeCoins || 0}\n`;
                serverInfo += `🎫 Штампы: ${userData.stamps || 0}\n`;
                serverInfo += `🛒 Корзина: ${userData.cart?.length || 0} товаров\n`;
                serverInfo += `⭐ Избранное: ${userData.favorites?.length || 0} товаров\n`;
                alert(info + serverInfo);
            } else {
                alert(info + '❌ Данные на сервере не найдены\n\n⚠️ Это нормально для нового пользователя. Добавьте товар в корзину, и данные будут созданы на сервере.');
            }
        }).catch(err => {
            alert(info + `❌ Ошибка загрузки с сервера:\n${err.message}\n\nПроверьте интернет-соединение.`);
        });
    } else if (!userId) {
        alert(info);
    } else {
        alert(info + '❌ userDataManager не загружен, невозможно проверить сервер');
    }
}

// Инициализация
function init() {
    console.log('🚀 Init function called');
    console.log('🔍 Проверка userDataManager:', {
        exists: typeof window.userDataManager !== 'undefined',
        getUserData: typeof window.userDataManager?.getUserData === 'function',
        getUserId: typeof window.userDataManager?.getUserId === 'function'
    });
    
    // Проверяем userId сразу
    if (window.tg?.initDataUnsafe?.user?.id) {
        console.log('✅ Telegram user ID доступен:', window.tg.initDataUnsafe.user.id);
    } else {
        console.error('❌ Telegram user ID НЕ доступен!');
        console.error('window.tg:', window.tg);
        console.error('window.tg?.initDataUnsafe:', window.tg?.initDataUnsafe);
    }
    
    if (tg) {
        tg.expand();
        // Отключаем модальное окно подтверждения при закрытии - просто закрываем приложение
        if (tg.disableClosingConfirmation) {
            tg.disableClosingConfirmation();
        }
        
        // Отключаем вертикальные свайпы для закрытия приложения
        if (tg.disableVerticalSwipes) {
            tg.disableVerticalSwipes();
        }
        
        // На главной странице скрываем кнопку "Назад"
        if (tg.BackButton) {
            tg.BackButton.hide();
        }
    }
    
    const verified = localStorage.getItem('ageVerified');
    console.log('LocalStorage ageVerified:', verified);
    if (verified === 'true') {
        ageVerified = true;
    }
    
    // Обновляем отображение выбранной точки самовывоза
    updatePickupLocationDisplay();
    
    // Загружаем товары из Google таблиц
    loadProductsFromGoogleSheets().then((loadedProducts) => {
        console.log('✅ Товары загружены, инициализация завершена');
        console.log('   Загружено товаров:', loadedProducts ? loadedProducts.length : products.length);
        // Товары будут показаны после выбора точки самовывоза
        // Если точка уже выбрана (из localStorage), показываем товары
        if (selectedPickupLocation) {
            if (typeof displayProducts === 'function') {
                displayProducts();
            } else if (typeof showCatalog === 'function') {
                showCatalog();
            }
        } else {
            // Показываем сообщение о необходимости выбора точки
            // Но не открываем выбор автоматически - это будет после подтверждения возраста
            showLocationRequiredMessage();
        }
    }).catch(err => {
        console.error('❌ Критическая ошибка загрузки товаров:', err);
        // Даже при ошибке пытаемся показать что есть
        if (selectedPickupLocation) {
            if (typeof displayProducts === 'function') {
                displayProducts();
            } else if (typeof showCatalog === 'function') {
                showCatalog();
            }
        } else {
            showLocationRequiredMessage();
        }
    });
    
    // Показываем splash экран, а потом проверку возраста
    setTimeout(() => {
        console.log('Timeout triggered, calling showAgeVerification');
        showAgeVerification();
    }, 2000); // Показываем splash 2 секунды
    
    // ВАЖНО: НЕ загружаем корзину и избранное здесь!
    // Они будут загружены с сервера в loadUserDataFromServer() (строки 1064-1123)
    // Это нужно для правильной синхронизации между устройствами
    
    const savedViewed = localStorage.getItem('viewedProducts');
    if (savedViewed) {
        try {
            viewedProducts = JSON.parse(savedViewed);
        } catch (e) {
            viewedProducts = [];
        }
    }
    
    // Загружаем тип доставки и время
    const savedDeliveryType = localStorage.getItem('deliveryType');
    if (savedDeliveryType) {
        deliveryType = savedDeliveryType;
    }
    const savedDeliveryTime = localStorage.getItem('deliveryTime');
    if (savedDeliveryTime) {
        deliveryTime = savedDeliveryTime;
    }
    const savedDeliveryAddress = localStorage.getItem('deliveryAddress');
    if (savedDeliveryAddress) {
        deliveryAddress = savedDeliveryAddress;
    }
    const savedPickupLocation = localStorage.getItem('selectedPickupLocation');
    if (savedPickupLocation) {
        selectedPickupLocation = savedPickupLocation;
    }
    const savedSelectedCity = localStorage.getItem('selectedCity');
    if (savedSelectedCity) {
        selectedCity = savedSelectedCity;
    }
    // НЕ загружаем сохраненный день и точное время - нужно выбирать каждый раз при оформлении заказа
    // const savedSelectedDeliveryDay = localStorage.getItem('selectedDeliveryDay');
    // if (savedSelectedDeliveryDay) {
    //     selectedDeliveryDay = savedSelectedDeliveryDay;
    // }
    // const savedDeliveryExactTime = localStorage.getItem('deliveryExactTime');
    // if (savedDeliveryExactTime) {
    //     deliveryExactTime = savedDeliveryExactTime;
    // }
    
    // Загружаем данные рефералов
    const savedReferrals = localStorage.getItem('referrals');
    if (savedReferrals) {
        try {
            referrals = JSON.parse(savedReferrals);
        } catch (e) {
            referrals = [];
        }
    }
    const savedReferralsData = localStorage.getItem('referralsData');
    if (savedReferralsData) {
        try {
            referralsData = JSON.parse(savedReferralsData);
        } catch (e) {
            referralsData = { total: 0, active: 0 };
        }
    }
    
    // Обработка реферального параметра и ссылок на товары при загрузке
    // Проверяем как URL параметр (старый формат), так и start_param из Telegram API (новый формат)
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    const startParam = tg && tg.initDataUnsafe ? tg.initDataUnsafe.start_param : null;
    
    // Обработка ссылки на товар (формат: PRODUCT_123)
    if (startParam && startParam.startsWith('PRODUCT_')) {
        const productId = parseInt(startParam.replace('PRODUCT_', ''));
        if (productId && products.find(p => p.id === productId)) {
            // Небольшая задержка, чтобы страница успела загрузиться
            setTimeout(() => {
                showProduct(productId);
            }, 500);
        }
    }
    // Обработка реферальной ссылки (формат: USER_123456)
    else if (startParam && startParam.startsWith('USER_')) {
        // Извлекаем ID из формата USER_123456
        const referrerId = startParam.replace('USER_', '');
        if (referrerId) {
            const currentUser = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
            const currentUserId = currentUser?.id?.toString() || '';
            
            // Сохраняем реферера только если это не сам пользователь
            if (referrerId && referrerId !== currentUserId && referrerId !== 'user') {
                const savedReferrer = localStorage.getItem('referrerId');
                if (!savedReferrer || savedReferrer !== referrerId) {
                    localStorage.setItem('referrerId', referrerId);
                    // Можно добавить уведомление пользователю о том, что он перешел по реферальной ссылке
                }
            }
        }
    }
    // Обработка старого формата реферальной ссылки через URL параметр
    else if (refParam) {
        const referrerId = refParam.toString();
        if (referrerId) {
            const currentUser = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
            const currentUserId = currentUser?.id?.toString() || '';
            
            // Сохраняем реферера только если это не сам пользователь
            if (referrerId && referrerId !== currentUserId && referrerId !== 'user') {
                const savedReferrer = localStorage.getItem('referrerId');
                if (!savedReferrer || savedReferrer !== referrerId) {
                    localStorage.setItem('referrerId', referrerId);
                }
            }
        }
    }
    
    // Загружаем заказы
    const savedOrders = localStorage.getItem('orders');
    if (savedOrders) {
        try {
            const parsedOrders = JSON.parse(savedOrders);
            // Убеждаемся, что orders - это массив
            if (Array.isArray(parsedOrders)) {
                orders = parsedOrders;
            } else {
                orders = [];
            }
            // Запускаем проверку статусов для всех pending заказов
            orders.forEach(order => {
                if (order.status === 'pending') {
                    checkOrderStatus(order.id);
                }
            });
        } catch (e) {
            orders = [];
        }
    }
    
    // ВАЖНО: Загружаем данные пользователя с сервера в первую очередь для синхронизации между устройствами
    // Функция для загрузки данных с сервера
    async function loadUserDataFromServer() {
        if (!window.userDataManager || !window.userDataManager.getUserData) {
            console.warn('userDataManager не загружен, используем localStorage');
            loadUserDataFromLocalStorage();
            return;
        }
        
        try {
            const userData = await window.userDataManager.getUserData();
            if (userData) {
                console.log('✅ Данные пользователя загружены с сервера:', userData);
                
                // Загружаем коины с сервера (приоритет серверным данным)
                if (userData.vapeCoins !== undefined) {
                    vapeCoins = userData.vapeCoins || 0;
                    localStorage.setItem('vapeCoins', vapeCoins.toString());
                    console.log('✅ Коины загружены с сервера:', vapeCoins);
                }
                
                // Загружаем штампы с сервера (приоритет серверным данным)
                if (userData.stamps !== undefined) {
                    const totalStamps = userData.stamps || 0;
                    completedStampSets = Math.floor(totalStamps / 10);
                    stamps = totalStamps % 10;
                    localStorage.setItem('stamps', totalStamps.toString());
                    console.log('✅ Штампы загружены с сервера:', totalStamps);
                }
                
                // Загружаем избранное с сервера (приоритет серверным данным)
                if (userData.favorites) {
                    favorites = userData.favorites;
                    localStorage.setItem('favorites', JSON.stringify(favorites));
                    console.log('✅ Избранное загружено с сервера:', favorites.length, 'товаров');
                }
                
                // Загружаем корзину с сервера (приоритет серверным данным)
                // ВАЖНО: Загружаем корзину даже если она пустая, чтобы синхронизировать состояние
                if (userData.cart !== undefined && Array.isArray(userData.cart)) {
                    cart = userData.cart;
                    localStorage.setItem('cart', JSON.stringify(cart));
                    updateCartBadge();
                    console.log('✅ Корзина загружена с сервера:', cart.length, 'товаров');
                }
                
                // Загружаем историю транзакций с сервера
                if (userData.transactions) {
                    vapeCoinsHistory = userData.transactions;
                    localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                    console.log('✅ История транзакций загружена с сервера');
                }
                
                // ВАЖНО: Загружаем заказы с сервера для синхронизации между устройствами
                if (userData.orders && Array.isArray(userData.orders)) {
                    // Объединяем заказы с сервера с локальными (приоритет серверным)
                    const serverOrderIds = new Set(userData.orders.map(o => o.id));
                    const localOrdersNotOnServer = orders.filter(o => !serverOrderIds.has(o.id));
                    orders = [...userData.orders, ...localOrdersNotOnServer].sort((a, b) => {
                        const dateA = new Date(a.createdAt || a.date || 0);
                        const dateB = new Date(b.createdAt || b.date || 0);
                        return dateB - dateA; // Новые заказы первыми
                    });
                    localStorage.setItem('orders', JSON.stringify(orders));
                    console.log('✅ Заказы загружены с сервера:', orders.length, 'заказов');
                }
            } else {
                console.warn('Данные пользователя не найдены на сервере, используем localStorage');
                loadUserDataFromLocalStorage();
            }
        } catch (err) {
            console.error('❌ Ошибка загрузки данных пользователя с сервера:', err);
            // Fallback на localStorage только если сервер недоступен
            loadUserDataFromLocalStorage();
        }
    }
    
    // ВАЖНО: Пытаемся загрузить данные с сервера
    // Если userDataManager еще не загружен, ждем и пробуем снова
    if (!window.userDataManager || !window.userDataManager.getUserData) {
        console.warn('⚠️ userDataManager еще не загружен, ждем...');
        // Пытаемся синхронизировать с сервером после загрузки userDataManager
        let attempts = 0;
        const maxAttempts = 15; // Увеличиваем количество попыток
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.userDataManager && window.userDataManager.getUserData) {
                clearInterval(checkInterval);
                console.log('✅ userDataManager загружен, загружаем данные с сервера');
                loadUserDataFromServer().then(() => {
                    console.log('✅ Инициализация завершена, данные загружены с сервера');
                }).catch(err => {
                    console.error('❌ Ошибка загрузки данных:', err);
                    loadUserDataFromLocalStorage();
                });
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.warn('⚠️ userDataManager не загрузился после', maxAttempts, 'попыток, используем localStorage');
                loadUserDataFromLocalStorage();
            }
        }, 200);
    } else {
        // userDataManager уже загружен, загружаем данные сразу
        console.log('✅ userDataManager уже загружен, загружаем данные с сервера');
        loadUserDataFromServer().then(() => {
            console.log('✅ Инициализация завершена, данные загружены с сервера');
        }).catch(err => {
            console.error('❌ Ошибка загрузки данных:', err);
            loadUserDataFromLocalStorage();
        });
    }
}

// Функция для загрузки данных из localStorage (fallback)
function loadUserDataFromLocalStorage() {
    // Загружаем штампы
    const savedStamps = localStorage.getItem('stamps');
    if (savedStamps) {
        try {
            const totalStamps = parseInt(savedStamps) || 0;
            // Вычисляем текущие штампы и количество собранных наборов
            completedStampSets = Math.floor(totalStamps / 10);
            stamps = totalStamps % 10; // Остаток от деления на 10
        } catch (e) {
            stamps = 0;
            completedStampSets = 0;
        }
    }
    
    // Загружаем частичный прогресс
    const savedPartialProgress = localStorage.getItem('partialItemsProgress');
    if (savedPartialProgress) {
        try {
            partialItemsProgress = parseFloat(savedPartialProgress) || 0;
        } catch (e) {
            partialItemsProgress = 0;
        }
    }
    
    // Загружаем количество собранных наборов из истории (для совместимости)
    const savedCompletedSets = localStorage.getItem('completedStampSets');
    if (savedCompletedSets) {
        try {
            completedStampSets = parseInt(savedCompletedSets) || 0;
        } catch (e) {
            completedStampSets = 0;
        }
    }
    
    // Загружаем Vape Coins
    const savedVapeCoins = localStorage.getItem('vapeCoins');
    if (savedVapeCoins) {
        try {
            vapeCoins = parseFloat(savedVapeCoins) || 0;
        } catch (e) {
            vapeCoins = 0;
        }
    }
    
    // Загружаем историю Vape Coins
    const savedVapeCoinsHistory = localStorage.getItem('vapeCoinsHistory');
    if (savedVapeCoinsHistory) {
        try {
            vapeCoinsHistory = JSON.parse(savedVapeCoinsHistory);
        } catch (e) {
            vapeCoinsHistory = [];
        }
    }
    
    // Загружаем тему
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme !== null) {
        darkMode = savedTheme === 'true';
        applyTheme();
    }
    
    updateCartBadge();
}

// Скрыть splash экран
function hideSplash() {
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
        splashScreen.classList.add('fade-out');
        setTimeout(() => {
            splashScreen.style.display = 'none';
        }, 800);
    }
}

// Функция для показа toast-уведомлений
function showToast(message, type = 'info', duration = 3000) {
    // Удаляем предыдущие toast, если есть
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Создаем элемент toast
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    // Определяем цвет в зависимости от типа
    let backgroundColor = '#007AFF'; // По умолчанию синий
    let icon = 'ℹ️';
    
    if (type === 'success') {
        backgroundColor = '#4CAF50';
        icon = '✅';
    } else if (type === 'error') {
        backgroundColor = '#f44336';
        icon = '❌';
    } else if (type === 'warning') {
        backgroundColor = '#FF9800';
        icon = '⚠️';
    }
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: ${backgroundColor};
        color: white;
        padding: 14px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 15px;
        font-weight: 500;
        width: 90%;
        max-width: 320px;
        text-align: center;
        opacity: 0;
        transition: all 0.3s ease;
        word-wrap: break-word;
        line-height: 1.4;
    `;
    
    toast.innerHTML = `${icon} ${message}`;
    
    document.body.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    }, 10);
    
    // Анимация исчезновения и удаление
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-100px)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, duration);
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        if (type === 'success') {
            tg.HapticFeedback.notificationOccurred('success');
        } else if (type === 'error') {
            tg.HapticFeedback.notificationOccurred('error');
        } else {
            tg.HapticFeedback.impactOccurred('light');
        }
    }
}

// Показать неблокирующее подтверждение заказа
function showOrderConfirmation(orderText, onConfirm) {
    // Удаляем предыдущие подтверждения, если есть
    const existingConfirmation = document.querySelector('.order-confirmation');
    if (existingConfirmation) {
        existingConfirmation.remove();
    }
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeOrderConfirmation();
        });
    }
    
    // Создаем панель подтверждения
    const confirmation = document.createElement('div');
    confirmation.className = 'order-confirmation';
    
    confirmation.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
        border-top-left-radius: 24px;
        border-top-right-radius: 24px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
        z-index: 10001;
        padding: 24px;
        transform: translateY(100%);
        transition: transform 0.3s ease;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    // Создаем затемненный фон
    const overlay = document.createElement('div');
    overlay.className = 'order-confirmation-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.3);
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    overlay.addEventListener('wheel', preventScroll, {passive: false});
    overlay.addEventListener('touchmove', preventScroll, {passive: false});
    
    // При клике на overlay закрываем (отменяем)
    overlay.addEventListener('click', () => {
        closeOrderConfirmation();
    });
    
    // Форматируем текст заказа с заменой эмодзи на SVG иконки и правильным форматированием
    let formattedOrderText = orderText
        .replace(/LOCATION/g, `<span style="display: inline-flex; align-items: center; vertical-align: middle; margin-right: 6px; width: 16px; height: 16px;">${getLocationIcon('#007AFF').replace('width="24" height="24"', 'width="16" height="16"')}</span>`)
        .replace(/CLOCK/g, `<span style="display: inline-flex; align-items: center; vertical-align: middle; margin-right: 6px; width: 16px; height: 16px;">${getClockIcon('#FF9800').replace('width="24" height="24"', 'width="16" height="16"')}</span>`)
        .replace(/PACKAGE/g, `<span style="display: inline-flex; align-items: center; vertical-align: middle; margin-right: 6px; width: 16px; height: 16px;">${getPackageIcon('#007AFF').replace('width="24" height="24"', 'width="16" height="16"')}</span>`)
        .replace(/COIN/g, `<span style="display: inline-flex; align-items: center; vertical-align: middle; margin-right: 4px; width: 16px; height: 16px;">${getCoinIcon('#FF9800', 16)}</span>`)
        .replace(/INFO/g, `<span style="display: inline-flex; align-items: center; vertical-align: middle; margin-right: 6px; width: 16px; height: 16px;">${getInfoIcon('#007AFF').replace('width="24" height="24"', 'width="16" height="16"')}</span>`)
        .split('\n')
        .map(line => line.trim() ? `<div style="margin-bottom: 8px; line-height: 1.6;">${line}</div>` : '<div style="margin-bottom: 4px;"></div>')
        .join('');
    
    confirmation.innerHTML = `
        <div style="margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
                <span style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#007AFF').replace('width="24" height="24"', 'width="32" height="32"')}</span>
                <div style="font-size: 24px; font-weight: 700; color: #000;">Подтверждение заказа</div>
            </div>
            <div style="background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); padding: 20px; border-radius: 16px; border: 2px solid #e5e5e5; font-size: 14px; max-height: 400px; overflow-y: auto; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                ${formattedOrderText}
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button id="cancel-order-btn" style="flex: 1; padding: 16px; background: #f5f5f5; color: #666; border: 2px solid #e5e5e5; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                Отмена
            </button>
            <button id="confirm-order-btn" style="flex: 1; padding: 16px; background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                Подтвердить
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(confirmation);
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        confirmation.style.transform = 'translateY(0)';
    });
    
    // Обработчики кнопок
    const confirmBtn = confirmation.querySelector('#confirm-order-btn');
    const cancelBtn = confirmation.querySelector('#cancel-order-btn');
    
    confirmBtn.addEventListener('click', () => {
        closeOrderConfirmation();
        onConfirm();
    });
    
    cancelBtn.addEventListener('click', () => {
        closeOrderConfirmation();
    });
    
    // Эффекты hover для кнопок
    confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#0056b3';
        confirmBtn.style.transform = 'scale(1.02)';
    });
    confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#007AFF';
        confirmBtn.style.transform = 'scale(1)';
    });
    
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#e0e0e0';
        cancelBtn.style.transform = 'scale(1.02)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = '#f5f5f5';
        cancelBtn.style.transform = 'scale(1)';
    });
    
    function closeOrderConfirmation() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        overlay.style.opacity = '0';
        confirmation.style.transform = 'translateY(100%)';
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (confirmation.parentNode) confirmation.remove();
            document.body.style.overflow = '';
        }, 300);
    }
}

// Показать проверку возраста
function showAgeVerification() {
    console.log('showAgeVerification called, ageVerified:', ageVerified);
    hideSplash();
    
    const ageVerification = document.getElementById('age-verification');
    const mainContent = document.getElementById('main-content');
    
    // Всегда показываем проверку возраста после splash экрана
    // для демонстрации. Закомментируйте если нужно проверять localStorage
    const forceShow = true; // Измените на false если нужна проверка localStorage
    
    if (ageVerified && !forceShow) {
        // Если возраст уже подтвержден, показываем основной контент
        console.log('Age already verified, showing main content');
        if (ageVerification) {
            ageVerification.classList.remove('show');
        }
        if (mainContent) {
            mainContent.classList.remove('hidden');
            showPage('catalog');
        }
    } else {
        // Показываем проверку возраста
        console.log('Showing age verification');
        if (ageVerification) {
            ageVerification.classList.add('show');
        }
        if (mainContent) {
            mainContent.classList.add('hidden');
        }
    }
}

// Показать основной контент
function showMainContent() {
    const ageVerification = document.getElementById('age-verification');
    const mainContent = document.getElementById('main-content');
    
    if (ageVerified) {
        if (ageVerification) {
            ageVerification.classList.remove('show');
        }
        if (mainContent) {
            mainContent.classList.remove('hidden');
            showPage('catalog');
            // Инициализируем SVG иконки после показа основного контента
            setTimeout(() => {
                initSVGIcons();
            }, 150);
        }
    } else {
        if (ageVerification) {
            ageVerification.classList.add('show');
        }
        if (mainContent) {
            mainContent.classList.add('hidden');
        }
    }
}

// Переключение страниц
function showPage(page, skipHistory = false, resetCatalog = false) {
    // Убеждаемся, что все модальные окна закрыты и стили восстановлены
    document.body.style.overflow = '';
    document.body.style.transform = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.body.style.scale = '';
    
    // Очищаем все модальные окна, если они остались
    document.querySelectorAll('.modal-overlay, .order-confirmation').forEach(modal => {
        modal.remove();
    });
    
    // Отменяем все активные анимации страницы
    if (activePageAnimationTimeout) {
        clearTimeout(activePageAnimationTimeout);
        activePageAnimationTimeout = null;
    }
    
    // Сбрасываем стили контейнера страницы и отменяем все анимации
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
        // Для страницы товара не очищаем содержимое - оно будет установлено в showProduct
        if (page !== 'product') {
        // Отменяем все анимации и переходы немедленно
        pageContent.style.transition = 'none';
        pageContent.style.opacity = '1';
        pageContent.style.transform = '';
        pageContent.style.scale = '';
        pageContent.style.width = '';
        pageContent.style.height = '';
        pageContent.style.left = '';
        pageContent.style.top = '';
        pageContent.style.right = '';
        pageContent.style.bottom = '';
        pageContent.style.display = '';
        pageContent.style.gridTemplateColumns = '';
        pageContent.style.gap = '';
        
        // Принудительно перерисовываем, чтобы применить изменения
        void pageContent.offsetHeight;
        } else {
            // Для страницы товара только сбрасываем некоторые стили, но не очищаем содержимое
            pageContent.style.transition = 'none';
            pageContent.style.display = '';
            pageContent.style.gridTemplateColumns = '';
            pageContent.style.gap = '';
        }
    }
    
    // Обработка двойного клика на вкладку "Ассортимент"
    if (page === 'catalog') {
        const now = Date.now();
        const timeSinceLastClick = now - lastCatalogClickTime;
        if (timeSinceLastClick < 500 && currentPage === 'catalog') {
            // Двойной клик - полный сброс каталога
            resetCatalog = true;
        }
        lastCatalogClickTime = now;
    }
    
    // Сохраняем состояние просмотра товара, если мы на странице товара и переходим на другую вкладку
    // НЕ сохраняем при переходе из каталога в каталог (когда выбираем вкус и возвращаемся)
    // Сохраняем только если переходим из product в другую основную вкладку (cart, favorites, profile, promotions)
    if (currentPage === 'product' && viewingProduct && page !== 'product' && page !== 'catalog' && 
        (page === 'cart' || page === 'favorites' || page === 'profile' || page === 'promotions')) {
        // Определяем, откуда был открыт товар (из избранного или из каталога)
        let fromPage = 'catalog'; // По умолчанию из каталога
        if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
            fromPage = 'favorites';
        }
        // Также проверяем сохраненные данные, если они есть
        const savedProduct = localStorage.getItem('lastViewedProduct');
        if (savedProduct) {
            try {
                const productData = JSON.parse(savedProduct);
                if (productData.fromPage) {
                    fromPage = productData.fromPage;
                }
            } catch (e) {
                // Игнорируем ошибку парсинга
            }
        }
        
        // Сохраняем товар в localStorage для восстановления при возврате в каталог
        localStorage.setItem('lastViewedProduct', JSON.stringify({
            id: viewingProduct.id,
            selectedFlavor: viewingProduct.selectedFlavor,
            selectedStrength: viewingProduct.selectedStrength,
            selectedFlavorIndex: viewingProduct.selectedFlavorIndex,
            fromPage: fromPage // Сохраняем откуда был открыт товар (из избранного или из каталога)
        }));
    } else if (currentPage === 'product' && viewingProduct && page === 'catalog') {
        // Если переходим из product в catalog, очищаем сохраненный товар
        localStorage.removeItem('lastViewedProduct');
    }
    
    // Определяем текущую вкладку (основную страницу)
    const getMainTab = (pageName) => {
        if (pageName === 'catalog' || pageName === 'product') return 'catalog';
        if (pageName === 'cart') return 'cart';
        if (pageName === 'profile' || pageName === 'orders' || pageName === 'vapeCoins' || pageName === 'referrals' || pageName === 'settings' || pageName === 'help') return 'profile';
        if (pageName === 'favorites') return 'favorites';
        if (pageName === 'promotions') return 'promotions';
        return pageName;
    };
    
    const currentTab = getMainTab(currentPage);
    const newTab = getMainTab(page);
    
    // Если переходим на другую вкладку или внутри одной вкладки, добавляем в историю вкладки
    if (!skipHistory && currentPage && currentPage !== page && currentPage !== 'product') {
        if (currentTab === newTab) {
            // Если переходим внутри одной вкладки (например, из catalog в product или из profile в orders)
            if (!tabHistory[currentTab]) {
                tabHistory[currentTab] = [];
            }
            // Добавляем текущую страницу в историю вкладки (максимум 2)
            if (tabHistory[currentTab].length === 0 || tabHistory[currentTab][tabHistory[currentTab].length - 1] !== currentPage) {
                tabHistory[currentTab].push(currentPage);
                // Оставляем только последние 2 страницы
                if (tabHistory[currentTab].length > 2) {
                    tabHistory[currentTab] = tabHistory[currentTab].slice(-2);
                }
            }
        } else {
            // Если переходим на другую вкладку, добавляем предыдущую страницу в историю новой вкладки
            // Например, из ассортимента в корзину - в истории корзины будет ассортимент
            if (!tabHistory[newTab]) {
                tabHistory[newTab] = [];
            }
            // Добавляем текущую страницу в историю новой вкладки (максимум 2)
            if (tabHistory[newTab].length === 0 || tabHistory[newTab][tabHistory[newTab].length - 1] !== currentPage) {
                tabHistory[newTab].push(currentPage);
                // Оставляем только последние 2 страницы
                if (tabHistory[newTab].length > 2) {
                    tabHistory[newTab] = tabHistory[newTab].slice(-2);
                }
            }
        }
    }
    
    // Добавляем текущую страницу в общую историю (если не пропущено)
    // Не добавляем каталог в историю при первой загрузке (когда currentPage еще не установлен или это начальная страница)
    if (!skipHistory && currentPage && currentPage !== page && currentPage !== 'product') {
        // Добавляем текущую страницу в историю только если она не последняя в истории
        // Это предотвращает дублирование
        if (pageHistory.length === 0 || pageHistory[pageHistory.length - 1] !== currentPage) {
            pageHistory.push(currentPage);
        }
    }
    
    // Если переходим на каталог с другой вкладки, проверяем сохраненный товар
    // НО только если мы действительно переходим с другой основной вкладки (cart, favorites, profile, promotions)
    // И только если товар был сохранен из product страницы
    if (page === 'catalog' && currentPage && currentPage !== 'catalog' && currentPage !== '' && currentPage !== 'product' &&
        (currentPage === 'cart' || currentPage === 'favorites' || currentPage === 'profile' || currentPage === 'promotions')) {
        const savedProduct = localStorage.getItem('lastViewedProduct');
        if (savedProduct) {
            try {
                const productData = JSON.parse(savedProduct);
                // Проверяем, что товар был сохранен из product страницы
                if (productData.fromPage === 'product') {
                    const product = products.find(p => p.id === productData.id);
                    if (product) {
                        // Восстанавливаем товар с полным состоянием
                        viewingProduct = product;
                        if (productData.selectedFlavor) {
                            viewingProduct.selectedFlavor = productData.selectedFlavor;
                            // Убеждаемся что индекс правильный
                            if (product.flavors && product.flavors.includes(productData.selectedFlavor)) {
                                viewingProduct.selectedFlavorIndex = product.flavors.indexOf(productData.selectedFlavor);
                            } else if (productData.selectedFlavorIndex !== undefined && product.flavors && product.flavors[productData.selectedFlavorIndex]) {
                                viewingProduct.selectedFlavorIndex = productData.selectedFlavorIndex;
                                viewingProduct.selectedFlavor = product.flavors[productData.selectedFlavorIndex];
                            } else if (product.flavors && product.flavors.length > 0) {
                                viewingProduct.selectedFlavorIndex = 0;
                                viewingProduct.selectedFlavor = product.flavors[0];
                            }
                        } else if (productData.selectedFlavorIndex !== undefined && product.flavors && product.flavors[productData.selectedFlavorIndex]) {
                            viewingProduct.selectedFlavorIndex = productData.selectedFlavorIndex;
                            viewingProduct.selectedFlavor = product.flavors[productData.selectedFlavorIndex];
                        } else if (product.flavors && product.flavors.length > 0) {
                            viewingProduct.selectedFlavorIndex = 0;
                            viewingProduct.selectedFlavor = product.flavors[0];
                        }
                        
                        if (productData.selectedStrength) {
                            viewingProduct.selectedStrength = productData.selectedStrength;
                        } else if (product.strengths && product.strengths.length > 0) {
                            viewingProduct.selectedStrength = product.strengths[0];
                        }
                        
                        // Показываем товар с восстановленными параметрами
                        // ВАЖНО: НЕ передаем favoriteFlavor/favoriteStrength, чтобы не определялось как избранное
                        // Передаем null для обоих параметров, чтобы товар открылся как из каталога
                        setTimeout(() => {
                            showProduct(productData.id, null, null);
                            // Восстанавливаем выбранный вкус и крепость после открытия товара
                            setTimeout(() => {
                                if (productData.selectedFlavor) {
                                    const flavorIndex = product.flavors ? product.flavors.indexOf(productData.selectedFlavor) : -1;
                                    if (flavorIndex >= 0) {
                                        selectFlavor(productData.selectedFlavor, flavorIndex);
                                    }
                                }
                                if (productData.selectedStrength && viewingProduct) {
                                    viewingProduct.selectedStrength = productData.selectedStrength;
                                    selectStrength(productData.selectedStrength);
                                }
                            }, 100);
                        }, 50);
                        localStorage.removeItem('lastViewedProduct'); // Очищаем после восстановления
                        // Подсвечиваем кнопку "Ассортимент" при восстановлении товара
                        document.querySelectorAll('.nav-item').forEach(btn => {
                            btn.classList.remove('active');
                            const onclick = btn.getAttribute('onclick');
                            if (onclick && onclick.includes("'catalog'")) {
                                btn.classList.add('active');
                            }
                        });
                        return;
                    }
                }
            } catch (e) {
                console.error('Error restoring product:', e);
                localStorage.removeItem('lastViewedProduct'); // Очищаем при ошибке
            }
        }
        // Если нет сохраненного товара или он не из product, очищаем viewingProduct
        viewingProduct = null;
        localStorage.removeItem('lastViewedProduct'); // Очищаем на всякий случай
    } else if (page === 'catalog') {
        // Если переходим на каталог из других мест, очищаем viewingProduct и сохраненный товар
        viewingProduct = null;
        localStorage.removeItem('lastViewedProduct');
    }
    
    currentPage = page;
    
    // Обновляем активную кнопку навигации
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        const onclick = btn.getAttribute('onclick');
        // Если мы на странице товара, подсвечиваем кнопку "Ассортимент" (catalog)
        if (page === 'product') {
            if (onclick && onclick.includes("'catalog'")) {
                btn.classList.add('active');
            }
        } else {
            // Для других страниц подсвечиваем соответствующую кнопку
            if (onclick && onclick.includes(`'${page}'`)) {
                btn.classList.add('active');
            }
        }
    });
    
    // Обновляем заголовок
    const titles = {
        'catalog': 'Ассортимент',
        'promotions': 'Акции',
        'cart': 'Корзина',
        'favorites': 'Избранное',
        'profile': 'Профиль',
        'orders': 'Мои заказы',
        'vapeCoins': 'Vape Coins',
        'referrals': 'Рефералы',
        'settings': 'Настройки',
        'help': 'Помощь'
    };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        if (page === 'vapeCoins') {
            pageTitle.innerHTML = '<span style="color: #ffffff;">Vape Coins</span>';
            pageTitle.style.background = 'none';
            pageTitle.style.color = '#ffffff';
        } else if (page === 'settings') {
            pageTitle.textContent = 'Настройки';
            pageTitle.style.background = '';
            pageTitle.style.color = '';
            pageTitle.innerHTML = 'Настройки';
        } else {
        pageTitle.textContent = titles[page] || 'Ассортимент';
            pageTitle.style.background = '';
            pageTitle.style.color = '';
            pageTitle.innerHTML = titles[page] || 'Ассортимент';
        }
    }
    
    // Обновляем стиль шапки при переходе на Vape Coins
    const mainNav = document.querySelector('.main-nav');
    const locationSelector = document.getElementById('pickup-location-selector');
    
    if (page === 'vapeCoins') {
        // Оранжевый градиент для всей шапки
        if (mainNav) {
            mainNav.style.background = 'linear-gradient(135deg, #FF9800 0%, #FF6B00 100%)';
        }
        // Обновляем стиль селектора точки
        if (locationSelector) {
            locationSelector.style.background = 'rgba(255,255,255,0.2)';
            locationSelector.style.color = '#ffffff';
            locationSelector.style.border = '1px solid rgba(255,255,255,0.4)';
        }
    } else {
        // Возвращаем синий цвет для шапки
        if (mainNav) {
            mainNav.style.background = '#007AFF';
        }
        // Возвращаем обычный стиль селектора точки
        if (locationSelector) {
            locationSelector.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%)';
            locationSelector.style.color = '#ffffff';
            locationSelector.style.border = '1px solid rgba(255,255,255,0.3)';
        }
    }
    
    // Обновляем отображение точки самовывоза
    updatePickupLocationDisplay();
    
    // Обновляем правую часть навигации (адрес или vapeshop)
    const navRightContent = document.getElementById('nav-right-content');
    if (navRightContent) {
        if (page === 'catalog') {
            // Для каталога показываем адрес с SVG иконкой
            if (selectedPickupLocation) {
                // Показываем адрес с ограничением ширины для статичного размера
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center; flex: 1; min-width: 0; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${selectedPickupLocation}</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.style.minWidth = '180px';
                navRightContent.style.maxWidth = '220px';
                navRightContent.style.width = 'auto';
                navRightContent.style.flex = '0 0 auto';
                navRightContent.onclick = () => selectPickupLocation();
            } else {
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; justify-content: center; width: 100%;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center;">Выберите точку</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.onclick = () => selectPickupLocation();
            }
        } else if (page === 'product') {
            // Для страницы товара показываем адрес с SVG иконкой
            if (selectedPickupLocation) {
                // Показываем адрес с ограничением ширины для статичного размера
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; justify-content: center; width: 100%;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center; flex: 1; min-width: 0; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${selectedPickupLocation}</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.style.minWidth = '180px';
                navRightContent.style.maxWidth = '220px';
                navRightContent.style.width = 'auto';
                navRightContent.style.flex = '0 0 auto';
                navRightContent.onclick = () => selectPickupLocation();
        } else {
                navRightContent.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px; justify-content: center; width: 100%;"><span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${getLocationIcon('#ffffff').replace('width="24" height="24"', 'width="16" height="16"')}</span><span style="text-align: center;">Выберите точку</span></span>`;
                navRightContent.style.cursor = 'pointer';
                navRightContent.style.textAlign = 'center';
                navRightContent.style.justifyContent = 'center';
                navRightContent.style.display = 'flex';
                navRightContent.onclick = () => selectPickupLocation();
            }
        } else {
            // Для других страниц показываем vapeshop с улучшенным стилем
            navRightContent.innerHTML = '<span style="font-weight: 800; letter-spacing: 3px; font-size: 18px; text-transform: uppercase; background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">VAPESHOP</span>';
            navRightContent.style.cursor = 'default';
            navRightContent.style.minWidth = '160px';
            navRightContent.style.maxWidth = '180px';
            navRightContent.style.padding = '8px 16px';
            navRightContent.style.width = '140px';
            navRightContent.style.flex = '0 0 140px';
            navRightContent.onclick = null;
        }
    }
    
    // Если на странице каталога и точка не выбрана, показываем сообщение
    if (page === 'catalog' && !selectedPickupLocation) {
        showLocationRequiredMessage();
    }
    
    // Показываем/скрываем элементы
    const searchSection = document.getElementById('search-section');
    const categoriesSection = document.getElementById('categories-section');
    const backBtn = document.getElementById('back-btn');
    const closeBtn = document.getElementById('close-btn');
    
    if (page === 'catalog') {
        // Если полный сброс каталога (двойной клик)
        if (resetCatalog) {
            viewingProduct = null;
            localStorage.removeItem('lastViewedProduct');
            currentCategory = 'all';
            sortOrder = null;
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // Сбрасываем активные категории
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent === 'Все товары') {
                    btn.classList.add('active');
                }
            });
        }
        // Если пользователь нажимает на вкладку "Ассортимент" с страницы товара,
        // очищаем viewingProduct и показываем главную страницу каталога
        if (viewingProduct && (currentPage === 'product' || currentPage === 'catalog')) {
            viewingProduct = null;
            localStorage.removeItem('lastViewedProduct'); // Очищаем сохраненный товар
        }
        // Если пользователь явно нажал на вкладку "Ассортимент" с другой вкладки (не из товара),
        // проверяем, есть ли сохраненный товар для восстановления
        else if (currentPage !== 'product' && currentPage !== 'catalog') {
            const savedProduct = localStorage.getItem('lastViewedProduct');
            if (savedProduct) {
                try {
                    const productData = JSON.parse(savedProduct);
                    if (productData && productData.id) {
                        // Восстанавливаем товар
                        // ВАЖНО: Не передаем selectedFlavor и selectedStrength как favoriteFlavor/favoriteStrength,
                        // чтобы товар не считался открытым из избранного. Вместо этого открываем товар без этих параметров,
                        // а затем устанавливаем выбранные значения отдельно
                        const wasFromFavorites = productData.fromPage === 'favorites';
                        showProduct(
                            productData.id, 
                            wasFromFavorites ? productData.selectedFlavor : null, 
                            wasFromFavorites ? productData.selectedStrength : null
                        );
                        // Если товар был открыт не из избранного, устанавливаем выбранные значения после открытия
                        if (!wasFromFavorites && (productData.selectedFlavor || productData.selectedStrength)) {
                            setTimeout(() => {
                                if (viewingProduct) {
                                    if (productData.selectedFlavor) {
                                        const product = products.find(p => p.id === productData.id);
                                        if (product && product.flavors) {
                                            const flavorIndex = product.flavors.indexOf(productData.selectedFlavor);
                                            if (flavorIndex >= 0) {
                                                selectFlavor(productData.selectedFlavor, flavorIndex);
                                            }
                                        }
                                    }
                                    if (productData.selectedStrength) {
                                        selectStrength(productData.selectedStrength);
                                    }
                                }
                            }, 100);
                        }
                        localStorage.removeItem('lastViewedProduct'); // Очищаем после восстановления
                        return;
                    }
                } catch (e) {
                    console.error('Error restoring product:', e);
                }
            }
        }
        
        // Очищаем viewingProduct если переходим на каталог (только если не восстанавливаем товар)
        if (!localStorage.getItem('lastViewedProduct')) {
            viewingProduct = null;
        }
        
        if (searchSection) searchSection.style.display = 'flex';
        if (categoriesSection) categoriesSection.style.display = 'flex';
        const favoritesTabsSection = document.getElementById('favorites-tabs-section');
        if (favoritesTabsSection) favoritesTabsSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'block';
        displayProducts();
        
        // Скроллим в начало при полном сбросе
        if (resetCatalog) {
            const pageContent = document.getElementById('page-content');
            if (pageContent) {
                setTimeout(() => {
                    pageContent.scrollTop = 0;
                }, 100);
            }
        }
    } else if (page === 'product') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'orders') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'vapeCoins') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'settings') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'referrals') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'help') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    } else if (page === 'favorites') {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        const favoritesTabsSection = document.getElementById('favorites-tabs-section');
        if (favoritesTabsSection) favoritesTabsSection.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'block';
    } else {
        if (searchSection) searchSection.style.display = 'none';
        if (categoriesSection) categoriesSection.style.display = 'none';
        const favoritesTabsSection = document.getElementById('favorites-tabs-section');
        if (favoritesTabsSection) favoritesTabsSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
    }
    
    // Управление кнопкой "Назад" через Telegram API
    if (tg && tg.BackButton) {
        if (page === 'catalog' && !viewingProduct) {
            // На главной странице скрываем кнопку назад
            tg.BackButton.hide();
        } else {
            // На других страницах показываем кнопку назад
            tg.BackButton.show();
        }
    }
    
    // Показываем контент страницы
    switch(page) {
        case 'catalog':
            // Проверяем, есть ли сохраненный товар для восстановления (уже обработано выше)
            // Если нет viewingProduct, значит показываем каталог (уже вызвано выше)
            break;
        case 'promotions':
            showPromotions();
            break;
        case 'cart':
            showCart();
            break;
        case 'favorites':
            showFavorites();
            break;
        case 'profile':
            showProfile();
            break;
        case 'orders':
            showOrders();
            break;
        case 'vapeCoins':
            showVapeCoins();
            break;
        case 'settings':
            showSettings();
            break;
        case 'referrals':
            showReferrals();
            break;
        case 'help':
            showHelp();
            break;
    }
    
    // Обновляем цвета иконок навигации после показа страницы
    updateNavIcons();
    
    // Проверяем и инициализируем SVG иконки, если они еще не установлены
    const navCatalogIcon = document.getElementById('nav-catalog-icon');
    if (navCatalogIcon && !navCatalogIcon.innerHTML.trim()) {
        initSVGIcons();
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Назад
function goBack() {
    // Определяем текущую вкладку
    const getMainTab = (pageName) => {
        if (pageName === 'catalog' || pageName === 'product') return 'catalog';
        if (pageName === 'cart') return 'cart';
        if (pageName === 'profile' || pageName === 'orders' || pageName === 'vapeCoins' || pageName === 'referrals' || pageName === 'settings' || pageName === 'help') return 'profile';
        if (pageName === 'favorites') return 'favorites';
        if (pageName === 'promotions') return 'promotions';
        return pageName;
    };
    
    const currentTab = getMainTab(currentPage);
    
    // Сбрасываем счетчик при успешной навигации
    if (viewingProduct) {
        // Если открыт товар, возвращаемся на предыдущую страницу из истории
        // Используем pageHistory для определения, откуда был открыт товар
        let previousPage = 'catalog';
        if (pageHistory.length > 0) {
            // Берем последнюю страницу из истории (откуда открыли товар)
            previousPage = pageHistory[pageHistory.length - 1];
            pageHistory.pop(); // Удаляем из истории
        } else {
            // Если истории нет, проверяем tabHistory
            if (!tabHistory[currentTab]) {
                tabHistory[currentTab] = [];
            }
            if (tabHistory[currentTab].length > 0) {
                previousPage = tabHistory[currentTab].pop();
            } else if (currentTab === 'catalog') {
                previousPage = 'catalog';
            }
        }
        
        viewingProduct = null;
        localStorage.removeItem('lastViewedProduct'); // Очищаем сохраненный товар
        
        // Восстанавливаем позицию скролла в избранном, если возвращаемся туда
        if (previousPage === 'favorites' && favoritesScrollPosition > 0) {
            showPage(previousPage, true); // skipHistory = true, чтобы не добавлять в историю
            // Восстанавливаем позицию после полной загрузки контента
            setTimeout(() => {
                const pageContent = document.getElementById('page-content');
                if (pageContent) {
                    // Устанавливаем позицию без анимации
                    pageContent.scrollTop = favoritesScrollPosition;
                }
            }, 300);
        } else {
            showPage(previousPage, true); // skipHistory = true, чтобы не добавлять в историю
            // Сбрасываем позицию скролла, если возвращаемся не в избранное
            if (previousPage !== 'favorites') {
                favoritesScrollPosition = 0;
            }
        }
        backButtonPressCount = 0; // Сбрасываем счетчик при успешной навигации
    } else {
        // Если есть история навигации для текущей вкладки, возвращаемся на предыдущую страницу
        if (!tabHistory[currentTab]) {
            tabHistory[currentTab] = [];
        }
        
        if (tabHistory[currentTab].length > 0) {
            const previousPage = tabHistory[currentTab].pop();
            showPage(previousPage, true); // skipHistory = true, чтобы не добавлять в историю
            backButtonPressCount = 0; // Сбрасываем счетчик при успешной навигации
        } else {
            // Если истории нет для текущей вкладки, закрываем приложение
            if (tg && tg.close) {
                tg.close();
            }
        }
    }
}

// Отображение товаров
function displayProducts(productsToShow = null) {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    // Проверяем, выбрана ли точка самовывоза
    if (!selectedPickupLocation) {
        showLocationRequiredMessage();
        return;
    }
    
    container.className = 'products-grid';
    
    // Очищаем inline стили, которые могли быть установлены в других функциях
    // и явно устанавливаем стили для сетки
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(2, 1fr)';
    container.style.gap = '12px';
    container.style.padding = '16px';
    container.style.background = '#f5f5f5';
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    container.style.transition = 'none';
    
    container.innerHTML = '';
    
    let filtered = productsToShow || products;
    
    // Фильтр по категории
    if (!productsToShow && currentCategory !== 'all') {
        if (currentCategory === 'vape') {
            // Для категории "Вейп" фильтруем по нескольким условиям
            filtered = products.filter(p => 
                p.category === 'vape' || 
                p.category === 'devices' || 
                (p.name && p.name.toLowerCase().includes('вейп')) ||
                (p.description && p.description.toLowerCase().includes('вейп'))
            );
        } else {
        filtered = products.filter(p => p.category === currentCategory);
        }
    }
    
    // Фильтр по городу (если выбрана точка самовывоза)
    // УБИРАЕМ фильтрацию - показываем все товары, даже если их нет в наличии
    // Товары без наличия будут показаны серым цветом с пометкой "Нет в наличии"
    // if (selectedPickupLocation && deliveryType === 'selfPickup') {
    //     const selectedCity = getCityFromLocation(selectedPickupLocation);
    //     if (selectedCity) {
    //         filtered = filtered.filter(product => {
    //             // Проверяем, есть ли товар хотя бы на одной точке в выбранном городе
    //             if (!product.stockByLocation || Object.keys(product.stockByLocation).length === 0) {
    //                 // Если нет информации о точках, показываем товар
    //                 return true;
    //             }
    //             // Проверяем наличие на точках в выбранном городе
    //             return Object.keys(product.stockByLocation).some(location => {
    //                 const locationCity = getCityFromLocation(location);
    //                 if (locationCity === selectedCity) {
    //                     const quantity = product.stockByLocation[location];
    //                     return quantity !== undefined && quantity > 0;
    //                 }
    //                 return false;
    //             });
    //         });
    //     }
    // }
    
    // Сортировка по наличию - сначала товары в наличии, потом не в наличии
    filtered = [...filtered].sort((a, b) => {
        const aInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(a, selectedPickupLocation)
            : (a.inStock !== false && (a.quantity === undefined || a.quantity > 0));
        const bInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(b, selectedPickupLocation)
            : (b.inStock !== false && (b.quantity === undefined || b.quantity > 0));
        
        // Сначала товары в наличии (true идет перед false)
        if (aInStock !== bInStock) {
            return bInStock ? 1 : -1;
        }
        
        // Если оба в наличии или оба не в наличии, применяем обычную сортировку
    if (sortOrder) {
            if (sortOrder === 'name_asc') return a.name.localeCompare(b.name);
            if (sortOrder === 'name_desc') return b.name.localeCompare(a.name);
            if (sortOrder === 'price_asc') return a.price - b.price;
            if (sortOrder === 'price_desc') return b.price - a.price;
        }
            return 0;
        });
    
    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-product-id', product.id);
        
        // Проверяем наличие товара на выбранной точке самовывоза
        const isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(product, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
        
        // Стили для отсутствующих товаров
        if (!isInStock) {
            card.style.opacity = '0.5';
            card.style.filter = 'grayscale(100%)';
        }
        
        // Добавляем стили для плавной анимации
        card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        card.style.cursor = 'pointer';
        card.style.outline = 'none';
        card.style.userSelect = 'none';
        card.style.webkitUserSelect = 'none';
        card.style.webkitTapHighlightColor = 'transparent';
        card.style.willChange = 'transform';
        card.style.backfaceVisibility = 'hidden';
        card.style.webkitBackfaceVisibility = 'hidden';
        card.style.transform = 'translateZ(0)'; // Создаем новый stacking context для предотвращения артефактов
        
        // Эффект поднятия при нажатии
        const handlePress = function(e) {
            // Останавливаем распространение события, чтобы не влиять на другие карточки
            e.stopPropagation();
            card.style.transform = 'translateY(-2px) translateZ(0)';
            card.style.transition = 'transform 0.15s ease';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
        };
        
        const handleRelease = function(e) {
            // Останавливаем распространение события
            e.stopPropagation();
            card.style.transform = 'translateY(0) translateZ(0)';
            card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
            card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
        };
        
        // Обработчики для touch и mouse
        card.addEventListener('touchstart', handlePress, { passive: true });
        card.addEventListener('touchend', handleRelease, { passive: true });
        card.addEventListener('touchcancel', handleRelease, { passive: true });
        card.addEventListener('mousedown', handlePress);
        card.addEventListener('mouseup', handleRelease);
        card.addEventListener('mouseleave', handleRelease);
        
        // Предотвращаем двойной клик и блокируем если точка не выбрана
        let lastClickTime = 0;
        card.addEventListener('click', function(e) {
            // Блокируем клик если точка самовывоза не выбрана
            if (!selectedPickupLocation) {
                e.preventDefault();
                e.stopPropagation();
                showToast('Сначала выберите точку самовывоза', 'error', 3000);
                return;
            }
            
            const now = Date.now();
            if (now - lastClickTime < 300) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            lastClickTime = now;
            showProduct(product.id);
        });
        // Определяем, что показывать - изображение или иконка
        let imageContent;
        if (product.imageUrl && product.imageUrl.trim() !== '') {
            const imgId = `product-img-${product.id}`;
            // Обрабатываем URL через processImageUrl для правильной загрузки
            const processedUrl = processImageUrl(product.imageUrl);
            const imageUrl = processedUrl || product.imageUrl;
            imageContent = `<img id="${imgId}" src="${imageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block;" onerror="handleImageError('${imgId}')" loading="lazy" crossorigin="anonymous">`;
        } else {
            imageContent = getPackageIcon('#999999');
        }
        
        // Отображаем только цену в BYN
        const priceDisplay = `<div class="product-price" style="${!isInStock ? 'color: #999;' : ''}">${product.price.toFixed(2)} BYN</div>`;
        
        // Фильтруем адреса по городу выбранной точки
        const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
        let locationsWithStock = [];
        if (!isInStock) {
            locationsWithStock = getLocationsWithStock(product);
            // Фильтруем по городу если выбран город
            if (selectedCity) {
                locationsWithStock = locationsWithStock.filter(location => {
                    if (selectedCity === 'Минск') {
                        return location.includes('Минск');
                    } else if (selectedCity === 'Могилёв' || selectedCity === 'Могилев') {
                        return location.includes('Могилёв') || location.includes('Могилев');
                    }
                    return true;
                });
            }
        }
        card.innerHTML = `
            <div class="product-image" data-product-id="${product.id}" style="${product.imageUrl ? 'background: #f8f8f8; overflow: hidden; position: relative;' : 'display: flex; align-items: center; justify-content: center;'} ${!isInStock ? 'opacity: 0.5;' : ''}">${imageContent}</div>
            <div class="product-info" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; width: 100%;">
                <div class="product-name" style="${!isInStock ? 'color: #999;' : ''}; text-align: left; width: 100%;">${product.name}</div>
                ${!isInStock ? `<div style="color: #f44336; font-size: 12px; margin-top: 4px; text-align: left; width: 100%;">Нет в наличии</div>` : ''}
                ${!isInStock && locationsWithStock.length > 0 ? `<div style="color: #666; font-size: 11px; margin-top: 2px; text-align: left; width: 100%; line-height: 1.3;">Есть на: ${locationsWithStock.join(', ')}</div>` : ''}
                <div style="text-align: left; width: 100%;">${priceDisplay}</div>
            </div>
        `;
        container.appendChild(card);
    });
    
    // Плавное появление контейнера
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        });
    });
}

// Показать товар
function showProduct(productId, favoriteFlavor = null, favoriteStrength = null) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Если точка не выбрана, показываем сообщение, но все равно открываем карточку
    if (!selectedPickupLocation) {
        showToast('Сначала выберите точку самовывоза', 'error', 3000);
        selectPickupLocation();
        // Не возвращаемся, продолжаем открытие карточки
    }
    
    // Сохраняем позицию скролла, если мы на странице избранного
    if (currentPage === 'favorites') {
        const pageContent = document.getElementById('page-content');
        if (pageContent) {
            favoritesScrollPosition = pageContent.scrollTop;
        }
    }
    
    // Добавляем текущую страницу в историю перед открытием товара
    // Важно: если мы уже на странице товара, не добавляем в историю
    if (currentPage && currentPage !== 'product') {
        // Проверяем, что последняя страница в истории не та же самая
        if (pageHistory.length === 0 || pageHistory[pageHistory.length - 1] !== currentPage) {
            pageHistory.push(currentPage);
        }
    } else if (!currentPage || currentPage === 'catalog') {
        // Если нет текущей страницы или это каталог, добавляем каталог в историю
        if (pageHistory.length === 0 || pageHistory[pageHistory.length - 1] !== 'catalog') {
            pageHistory.push('catalog');
        }
    }
    // Если мы на странице избранного и переходим на товар, сохраняем 'favorites'
    if (currentPage === 'favorites' && (pageHistory.length === 0 || pageHistory[pageHistory.length - 1] !== 'favorites')) {
        pageHistory.push('favorites');
    }
    
    viewingProduct = product;
    
    // Обновляем интерфейс через showPage для правильного отображения кнопок и заголовка
    // Вызываем showPage ДО установки содержимого, чтобы не перезаписать его
    showPage('product', true);
    
    // Определяем, откуда открыт товар - из избранного или из каталога
    // ВАЖНО: favoriteFlavor и favoriteStrength передаются только при открытии из избранного
    // Если они null или undefined, значит товар открыт из каталога
    const isFromFavorites = currentPage === 'favorites' || 
                            (favoriteFlavor !== null && favoriteFlavor !== undefined && favoriteFlavor !== '') || 
                            (favoriteStrength !== null && favoriteStrength !== undefined && favoriteStrength !== '');
    
    // Подсвечиваем правильную кнопку в зависимости от того, откуда открыт товар
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.remove('active');
            const onclick = btn.getAttribute('onclick');
            if (isFromFavorites) {
                // Если товар открыт из избранного, подсвечиваем кнопку "Избранное"
                if (onclick && onclick.includes("'favorites'")) {
                    btn.classList.add('active');
                }
            } else {
                // Если товар открыт из каталога, подсвечиваем кнопку "Ассортимент"
                if (onclick && onclick.includes("'catalog'")) {
                    btn.classList.add('active');
                }
            }
        });
    }, 10);
    
    // Показываем кнопку "Назад" при открытии страницы товара
    if (tg && tg.BackButton) {
        tg.BackButton.show();
    }
    
    // Если открываем товар из избранного, устанавливаем сохраненные вкус и крепость
    if (favoriteFlavor || favoriteStrength) {
        if (favoriteFlavor && product.flavors && product.flavors.includes(favoriteFlavor)) {
            viewingProduct.selectedFlavor = favoriteFlavor;
            viewingProduct.selectedFlavorIndex = product.flavors.indexOf(favoriteFlavor);
        } else if (product.flavors && product.flavors.length > 0) {
            // Если вкус не найден, используем первый доступный
            viewingProduct.selectedFlavor = product.flavors[0];
            viewingProduct.selectedFlavorIndex = 0;
        }
        
        if (favoriteStrength && product.strengths && product.strengths.includes(favoriteStrength)) {
            viewingProduct.selectedStrength = favoriteStrength;
        } else if (product.strengths && product.strengths.length > 0) {
            // Если крепость не найдена, используем первую доступную
            viewingProduct.selectedStrength = product.strengths[0];
        }
    } else {
        // Если не из избранного, выбираем первый вкус который есть в наличии
        // Это важно при открытии товара из каталога - показываем доступный вкус
        if (product.flavors && product.flavors.length > 0) {
            // Находим первый вкус который есть в наличии
            let firstAvailableFlavorIndex = -1;
            let firstAvailableFlavor = null;
            
            for (let i = 0; i < product.flavors.length; i++) {
                const flavor = product.flavors[i];
                const isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isFlavorInStockAtLocation(product, flavor, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                
                if (isInStock) {
                    firstAvailableFlavorIndex = i;
                    firstAvailableFlavor = flavor;
                    break;
                }
            }
            
            // Если нашли доступный вкус, используем его, иначе используем первый
            if (firstAvailableFlavorIndex >= 0 && firstAvailableFlavor) {
                viewingProduct.selectedFlavorIndex = firstAvailableFlavorIndex;
                viewingProduct.selectedFlavor = firstAvailableFlavor;
            } else {
                viewingProduct.selectedFlavorIndex = 0;
                viewingProduct.selectedFlavor = product.flavors[0];
            }
        }
        if (product.strengths && product.strengths.length > 0) {
            viewingProduct.selectedStrength = product.strengths[0];
        }
    }
    
    // Добавляем в недавно просмотренные
    if (!viewedProducts.includes(productId)) {
        viewedProducts.unshift(productId);
        // Оставляем только последние 10
        if (viewedProducts.length > 10) {
            viewedProducts = viewedProducts.slice(0, 10);
        }
        localStorage.setItem('viewedProducts', JSON.stringify(viewedProducts));
    }
    
    // Получаем контейнер после showPage - используем setTimeout чтобы убедиться что showPage завершился
    let container = document.getElementById('page-content');
    if (!container) {
        // Если контейнер не найден сразу, ждем немного и пробуем снова
        setTimeout(() => {
            container = document.getElementById('page-content');
            if (!container) {
                console.error('Container not found after timeout');
                return;
            }
            // Передаем правильные параметры - если favoriteFlavor/favoriteStrength не переданы, передаем null
            // чтобы показать все варианты (не из избранного)
            const flavorToRender = (favoriteFlavor !== null && favoriteFlavor !== undefined) ? favoriteFlavor : null;
            const strengthToRender = (favoriteStrength !== null && favoriteStrength !== undefined) ? favoriteStrength : null;
            renderProductContent(container, product, flavorToRender, strengthToRender);
        }, 50);
        return;
    }
    
    // Убеждаемся что контейнер видим и готов к отображению
    container.style.display = 'block';
    container.style.visibility = 'visible';
    container.style.opacity = '1'; // Сразу показываем, чтобы не было пустого экрана
    
    // Начальное состояние для анимации
    container.style.transform = 'translateY(20px)';
    container.style.transition = 'none';
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = '#ffffff';
    
    // Сразу устанавливаем содержимое, чтобы не было пустого экрана
    // Если favoriteFlavor/favoriteStrength переданы явно (не null и не undefined), используем их
    // Иначе передаем null чтобы показать все варианты (не из избранного)
    const flavorToRender = (favoriteFlavor !== null && favoriteFlavor !== undefined) ? favoriteFlavor : null;
    const strengthToRender = (favoriteStrength !== null && favoriteStrength !== undefined) ? favoriteStrength : null;
    renderProductContent(container, product, flavorToRender, strengthToRender);
}

// Функция для рендеринга содержимого карточки товара
function renderProductContent(container, product, favoriteFlavor, favoriteStrength) {
    if (!container || !product) {
        console.error('renderProductContent: container or product is missing');
        return;
    }
    
    // Проверяем, открыт ли товар из избранного (если переданы favoriteFlavor или favoriteStrength)
    // Но если favoriteFlavor/favoriteStrength переданы как null явно, это не избранное
    const isFromFavorites = (favoriteFlavor !== null && favoriteFlavor !== undefined) || (favoriteStrength !== null && favoriteStrength !== undefined);
    
    let strengthOptions = '';
    if (product.strengths) {
        // Определяем выбранную крепость
        const selectedStrength = viewingProduct.selectedStrength || product.strengths[0];
        
        // Если товар из избранного, показываем только выбранную крепость как информацию
        if (isFromFavorites && favoriteStrength) {
            strengthOptions = `
                <div style="margin: 20px 0;">
                    <div style="font-weight: 600; margin-bottom: 12px;">Крепость</div>
                    <div style="padding: 12px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); 
                        border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; 
                        font-size: 14px; color: #1976d2; font-weight: 600;">
                        <span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">${getLightningIcon('#1976d2')}</span>
                        <span>${favoriteStrength}</span>
                    </div>
                </div>
            `;
        } else {
            // Показываем все варианты крепости для выбора
            strengthOptions = `
                <div style="margin: 20px 0;">
                    <div style="font-weight: 600; margin-bottom: 12px;">Крепость</div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${product.strengths.map((str, idx) => {
                            const isSelected = str === selectedStrength;
                            return `
                            <button onclick="selectStrength('${str}')" id="strength-${idx}" 
                                style="padding: 10px 20px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; border-radius: 20px; 
                                background: ${isSelected ? '#007AFF' : '#ffffff'}; 
                                color: ${isSelected ? '#ffffff' : '#000'}; 
                                cursor: pointer; font-weight: 500;">
                                ${str}
                            </button>
                        `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    }
    
    let flavorOptions = '';
    // Не показываем выбор вкусов для устройств (devices, accessories) - только для жидкостей
    if (product.flavors && product.flavors.length > 0 && product.category !== 'devices' && product.category !== 'accessories') {
        // Определяем выбранный вкус
        const selectedFlavorIndex = viewingProduct.selectedFlavorIndex !== undefined ? viewingProduct.selectedFlavorIndex : 0;
        const selectedFlavor = viewingProduct.selectedFlavor || product.flavors[selectedFlavorIndex];
        
        // Если товар из избранного, показываем только выбранный вкус как информацию
        if (isFromFavorites && favoriteFlavor) {
            const flavorImage = (product.flavorImages && product.flavorImages[favoriteFlavor]) 
                ? product.flavorImages[favoriteFlavor] 
                : (product.imageUrl || null);
                            // Обрабатываем URL через processImageUrl для правильной загрузки
                            const processedFlavorUrl = flavorImage ? processImageUrl(flavorImage) : null;
                            const flavorImageContent = processedFlavorUrl
                                ? `<img src="${processedFlavorUrl}" alt="${favoriteFlavor}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; display: block; margin: 0 auto;" loading="lazy" crossorigin="anonymous">`
                                : getPackageIcon('#999999');
            
            // Проверяем наличие вкуса на выбранной точке
            const isFlavorInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? isFlavorInStockAtLocation(product, favoriteFlavor, selectedPickupLocation)
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
            
            // Получаем список точек, где есть этот вкус (отфильтрованный по городу)
            const selectedCity = getCityFromLocation(selectedPickupLocation || currentLocation);
            const flavorLocations = !isFlavorInStock ? getLocationsWithFlavorStockByCity(product, favoriteFlavor, selectedCity) : [];
            
            flavorOptions = `
                <div style="margin: 20px 0;">
                    <div style="font-weight: 600; margin-bottom: 12px;">Вкус</div>
                    <div style="padding: 12px; background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); 
                        border-radius: 12px; display: flex; align-items: center; gap: 12px;">
                        <div style="width: 60px; height: 60px; border-radius: 50%; background: #f0f0f0; 
                            display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                            ${flavorImageContent}
                        </div>
                        <div style="font-size: 16px; color: #d32f2f; font-weight: 600;">
                            ${favoriteFlavor}
                        </div>
                    </div>
                    ${!isFlavorInStock && flavorLocations.length > 0 ? `
                        <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; font-size: 13px; color: #666; line-height: 1.5;">
                            <div style="font-weight: 600; margin-bottom: 4px; color: #333;">Есть в наличии на:</div>
                            <div>${flavorLocations.join(', ')}</div>
                        </div>
                    ` : (!isFlavorInStock && flavorLocations.length === 0 ? '<div style="margin-top: 12px; padding: 12px; background: #fff3f3; border-radius: 12px; font-size: 13px; color: #f44336; line-height: 1.5; text-align: center; font-weight: 600;">Товара нет ни на одной точке</div>' : '')}
                </div>
            `;
        } else {
            // Показываем все вкусы для выбора
            let allFlavors = [...product.flavors];
            
            // Сортируем вкусы - сначала в наличии, потом не в наличии
            allFlavors = allFlavors.sort((a, b) => {
                const aInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isFlavorInStockAtLocation(product, a, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                const bInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isFlavorInStockAtLocation(product, b, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                
                // Сначала вкусы в наличии (true идет перед false)
                if (aInStock !== bInStock) {
                    return bInStock ? 1 : -1;
                }
                return 0;
            });
            
            // Убеждаемся что selectedFlavorIndex правильный после сортировки
            // Если выбранный вкус не в наличии, выбираем первый доступный
            let currentSelectedIndex = viewingProduct.selectedFlavorIndex;
            if (viewingProduct.selectedFlavor) {
                currentSelectedIndex = allFlavors.indexOf(viewingProduct.selectedFlavor);
            }
            if (currentSelectedIndex < 0 || currentSelectedIndex >= allFlavors.length) {
                currentSelectedIndex = 0;
            }
            
            // Проверяем, есть ли выбранный вкус в наличии
            const selectedFlavor = allFlavors[currentSelectedIndex];
            const isSelectedInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? isFlavorInStockAtLocation(product, selectedFlavor, selectedPickupLocation)
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
            
            // ВАЖНО: НЕ меняем выбранный вкус, даже если он недоступен
            // Пользователь должен видеть выбранный вкус, даже если его нет в наличии
            let finalSelectedFlavor = selectedFlavor;
            
            // Обновляем viewingProduct с правильным индексом и вкусом
            // ВАЖНО: Используем оригинальный индекс из product.flavors, а не из отсортированного массива
            // НЕ меняем выбранный вкус - сохраняем тот, который выбрал пользователь
            // Если пользователь уже выбрал вкус (даже если он недоступен), сохраняем его выбор
            if (viewingProduct.selectedFlavor && product.flavors.includes(viewingProduct.selectedFlavor)) {
                // Сохраняем выбранный пользователем вкус, даже если он недоступен
                viewingProduct.selectedFlavorIndex = product.flavors.indexOf(viewingProduct.selectedFlavor);
                viewingProduct.selectedFlavor = viewingProduct.selectedFlavor;
                finalSelectedFlavor = viewingProduct.selectedFlavor;
                // Обновляем currentSelectedIndex для правильного отображения
                const originalIndexInSorted = allFlavors.indexOf(viewingProduct.selectedFlavor);
                if (originalIndexInSorted >= 0) {
                    currentSelectedIndex = originalIndexInSorted;
                }
            } else {
                // Только если вкус не был выбран ранее, используем текущий
                viewingProduct.selectedFlavorIndex = product.flavors.indexOf(finalSelectedFlavor);
                viewingProduct.selectedFlavor = finalSelectedFlavor;
            }
            const currentSelectedFlavor = finalSelectedFlavor;
            
            // Обновляем currentSelectedIndex для правильного отображения в списке вкусов
            // Находим индекс в отсортированном массиве для правильного выделения
            const sortedIndex = allFlavors.indexOf(finalSelectedFlavor);
            if (sortedIndex >= 0) {
                currentSelectedIndex = sortedIndex;
            }
            
            flavorOptions = `
                <div style="margin: 20px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 600;">Вкус</div>
                        <button onclick="showFlavorModal()" style="padding: 6px 12px; border: 1px solid #e5e5e5; 
                            border-radius: 12px; background: #ffffff; cursor: pointer; font-size: 12px;">
                            Все
                        </button>
                    </div>
                    <div class="flavors-scroll-container" style="display: flex; justify-content: flex-start; gap: 12px; overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; position: relative; flex-wrap: nowrap; width: 100%;">
                        <style>
                            div[style*="overflow-x: auto"]::-webkit-scrollbar {
                                display: none;
                                width: 0;
                                height: 0;
                                background: transparent;
                            }
                        </style>
                        ${allFlavors.map((flavor, idx) => {
                            // Используем оригинальный индекс из product.flavors для правильной работы
                            const originalIndex = product.flavors.indexOf(flavor);
                            // Используем строгое сравнение - проверяем что вкус совпадает с выбранным
                            const isSelected = (flavor === currentSelectedFlavor);
                            
                            // Проверяем наличие вкуса на выбранной точке
                            const isFlavorInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                                ? isFlavorInStockAtLocation(product, flavor, selectedPickupLocation)
                                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                            
                            // Получаем список точек, где есть этот вкус (отфильтрованный по городу выбранной точки)
                            const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                            const flavorLocations = !isFlavorInStock ? getLocationsWithFlavorStockByCity(product, flavor, selectedCity) : [];
                            
                            // Определяем изображение для вкуса
                            const flavorImage = (product.flavorImages && product.flavorImages[flavor]) 
                                ? product.flavorImages[flavor] 
                                : (product.imageUrl || null);
                            const flavorImgId = `flavor-img-${originalIndex}-${Date.now()}`;
                            // Обрабатываем URL через processImageUrl для правильной загрузки
                            const processedFlavorUrl = flavorImage ? processImageUrl(flavorImage) : null;
                            const flavorImageContent = processedFlavorUrl
                                ? `<img id="${flavorImgId}" src="${processedFlavorUrl}" alt="${flavor}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; margin: 0 auto; ${!isFlavorInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}" onerror="handleImageError('${flavorImgId}')" loading="lazy" crossorigin="anonymous">`
                                : getPackageIcon(!isFlavorInStock ? '#999999' : '#999999');
                            
                            // Всегда вызываем selectFlavor, даже если вкус не в наличии
                            // ВАЖНО: Для недоступных вкусов тоже обновляем карточку, а не открываем модальное окно
                            const onClickAction = `event.stopPropagation(); selectFlavor('${flavor.replace(/'/g, "\\'")}', ${originalIndex});`;
                            
                            // Определяем сообщение о наличии для вкуса
                            let stockMessage = '';
                            if (!isFlavorInStock) {
                                if (flavorLocations.length === 0) {
                                    stockMessage = '<div style="font-size: 10px; color: #f44336; text-align: center; width: 100%; margin-top: 2px;">Нет ни на одной точке</div>';
                                } else {
                                    stockMessage = '<div style="font-size: 10px; color: #666; text-align: center; width: 100%; margin-top: 2px;">Нет в наличии</div>';
                                }
                            }
                            
                            return `
                            <div onclick="${onClickAction}" id="flavor-${originalIndex}" 
                                style="width: 80px; min-width: 80px; max-width: 80px; text-align: center; cursor: pointer; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; outline: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; pointer-events: auto;">
                                <div style="width: 80px; height: 80px; border-radius: 50%; background: ${!isFlavorInStock ? '#e0e0e0' : '#f0f0f0'}; 
                                    display: flex; align-items: center; justify-content: center; 
                                    border: ${isSelected ? '3px solid #007AFF' : (!isFlavorInStock ? '2px solid #999' : '2px solid #e5e5e5')}; 
                                    margin-bottom: 8px; overflow: visible; position: relative; flex-shrink: 0; box-shadow: ${isSelected ? '0 2px 8px rgba(0,122,255,0.3)' : '0 1px 3px rgba(0,0,0,0.1)'}; ${!isFlavorInStock ? 'opacity: 0.6; filter: grayscale(100%);' : ''}">
                                    <div style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden; position: relative;">
                                        ${flavorImageContent}
                                    </div>
                                    ${isSelected ? '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; background: #007AFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><span style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">✓</span></div>' : ''}
                                </div>
                                <div style="font-size: 12px; color: ${isSelected ? '#007AFF' : (!isFlavorInStock ? '#999' : '#000')}; font-weight: ${isSelected ? '600' : '400'}; text-align: center; width: 100%; min-height: 32px; display: flex; align-items: center; justify-content: center; line-height: 1.2;">
                                    <span>${flavor.length > 15 ? flavor.substring(0, 15) + '...' : flavor}</span>
                                </div>
                                <div style="min-height: 16px; display: flex; align-items: center; justify-content: center; margin-top: 2px;">
                                    ${stockMessage}
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    }
    
    // Определяем изображение для страницы товара (с учетом выбранного вкуса)
    // ВАЖНО: Используем актуальный selectedFlavor из viewingProduct (уже установлен в flavorOptions выше)
    const selectedFlavor = viewingProduct.selectedFlavor || null;
    const selectedStrength = viewingProduct.selectedStrength || null;
    const isFav = isFavorite(product.id, selectedFlavor, selectedStrength);
    
    let productImageUrl = product.imageUrl;
    if (selectedFlavor && product.flavorImages && product.flavorImages[selectedFlavor]) {
        productImageUrl = product.flavorImages[selectedFlavor];
    }
    const productImageContent = productImageUrl
        ? `<img src="${productImageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 12px;" onerror="this.parentElement.innerHTML='${getPackageIcon('#999999')}'; this.parentElement.style.fontSize='0'; this.parentElement.style.display='flex'; this.parentElement.style.alignItems='center'; this.parentElement.style.justifyContent='center';">`
        : getPackageIcon('#999999');
    
    // Убеждаемся, что контейнер видим
    container.style.display = 'block';
    container.style.visibility = 'visible';
    
    // ВАЖНО: Сохраняем позицию скролла перед перерисовкой, чтобы не было сброса в начало
    // Сохраняем как позицию контейнера, так и позицию окна (для случаев когда скроллит вся страница)
    const scrollPosition = container.scrollTop || 0;
    const scrollHeight = container.scrollHeight || 0;
    const windowScrollY = window.scrollY || window.pageYOffset || 0;
    const documentScrollTop = document.documentElement.scrollTop || 0;
    // Сохраняем относительную позицию скролла (в процентах) для более точного восстановления
    const scrollRatio = scrollHeight > 0 ? scrollPosition / scrollHeight : 0;
    
    // Проверяем наличие товара для определения стилей
    // ВАЖНО: Проверяем наличие ПОСЛЕ того как selectedFlavor установлен в viewingProduct
    let isProductInStock = false;
    const currentSelectedFlavor = viewingProduct.selectedFlavor || selectedFlavor;
    if (currentSelectedFlavor) {
        isProductInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(product, currentSelectedFlavor, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    } else {
        isProductInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(product, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    }
    
    container.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div id="product-image-container" style="width: 100%; height: 350px; background: #ffffff; border-radius: 12px; 
                display: flex; align-items: center; justify-content: center; font-size: ${productImageUrl ? '0' : '100px'}; margin-bottom: 20px; overflow: hidden; padding: ${productImageUrl ? '0' : '20px'}; border: 1px solid #e5e5e5; ${!isProductInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}">
                ${productImageContent}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span style="padding: 6px 12px; background: #000; color: #fff; border-radius: 12px; font-size: 12px;">
                    ${product.category === 'liquids' ? 'Жидкость' : product.category === 'accessories' ? 'Расходник' : 'Одноразка'}
                </span>
                <div style="display: flex; gap: 12px;">
                    <button onclick="shareProduct(${product.id})" style="width: 36px; height: 36px; 
                        border-radius: 50%; border: 1.5px solid #e5e5e5; background: #ffffff; cursor: pointer; 
                        transition: all 0.3s ease; display: flex; align-items: center; justify-content: center;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);"
                        onmouseover="this.style.borderColor='#007AFF'; this.style.background='#f0f7ff'; this.style.transform='scale(1.05)'"
                        onmouseout="this.style.borderColor='#e5e5e5'; this.style.background='#ffffff'; this.style.transform='scale(1)'">
                        ${getShareIcon('#007AFF')}
                    </button>
                    <button id="favorite-btn-${product.id}" onclick="toggleFavorite(${product.id})" style="width: 36px; height: 36px; 
                        border-radius: 50%; border: ${isFav ? '2px solid #ff4444' : '1px solid #e5e5e5'}; background: #ffffff; cursor: pointer; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); display: flex; align-items: center; justify-content: center; position: relative; overflow: visible;">
                        <span id="heart-icon-${product.id}" style="display: flex; align-items: center; justify-content: center; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
                            ${isFav ? getHeartFilledIcon('#ff4444') : getHeartEmptyIcon('#999999')}
                        </span>
                    </button>
                </div>
            </div>
            <div style="font-size: 24px; font-weight: 700; margin-bottom: 8px;" id="product-name-display">
                ${selectedFlavor ? `${product.name}, ${selectedFlavor}` : product.name}
            </div>
                        <div style="font-size: 28px; font-weight: 700; color: #007AFF; margin-bottom: 20px;">
                            ${product.price.toFixed(2)} BYN
                        </div>
            ${strengthOptions}
            ${flavorOptions}
            ${(() => {
                // Проверяем наличие товара или конкретного вкуса
                let isInStock = false;
                let locationsWithStock = [];
                
                if (selectedFlavor) {
                    // Проверяем наличие конкретного вкуса
                    isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                        ? isFlavorInStockAtLocation(product, selectedFlavor, selectedPickupLocation)
                        : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                    
                    if (!isInStock) {
                        // Получаем адреса для конкретного вкуса, отфильтрованные по городу выбранной точки
                        const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                        locationsWithStock = getLocationsWithFlavorStockByCity(product, selectedFlavor, selectedCity);
                    }
                } else {
                    // Проверяем общее наличие товара
                    isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isProductInStockAtLocation(product, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                
                if (!isInStock) {
                        locationsWithStock = getLocationsWithStock(product);
                        // Фильтруем по городу если выбран город
                        const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                        if (selectedCity) {
                            locationsWithStock = locationsWithStock.filter(location => {
                                if (selectedCity === 'Минск') {
                                    return location.includes('Минск');
                                } else if (selectedCity === 'Могилёв' || selectedCity === 'Могилев') {
                                    return location.includes('Могилёв') || location.includes('Могилев');
                                }
                                return true;
                            });
                        }
                    }
                }
                
                if (!isInStock) {
                    // Если товар открыт из избранного с конкретным вкусом и информация о наличии уже показана в flavorOptions, не дублируем
                    const showLocationInfo = !isFromFavorites || !favoriteFlavor;
                    
                    return `
                        <div style="margin-top: 20px;">
                            <button disabled style="width: 100%; padding: 16px; 
                                background: #cccccc; color: white; border: none; border-radius: 12px; 
                                font-size: 16px; font-weight: 600; cursor: not-allowed; opacity: 0.6;">
                                Нет в наличии
                            </button>
                            ${showLocationInfo && locationsWithStock.length > 0 ? `
                                <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; font-size: 13px; color: #666; line-height: 1.5;">
                                    <div style="font-weight: 600; margin-bottom: 4px; color: #333;">Есть в наличии на:</div>
                                    <div>${locationsWithStock.join(', ')}</div>
                                </div>
                            ` : (showLocationInfo && locationsWithStock.length === 0 ? '<div style="margin-top: 12px; padding: 12px; background: #fff3f3; border-radius: 12px; font-size: 13px; color: #f44336; line-height: 1.5; text-align: center; font-weight: 600;">Товара нет ни на одной точке</div>' : '')}
                        </div>
                        `;
                } else {
                    // Проверяем наличие выбранного вкуса перед показом кнопки
                    const selectedFlavorForButton = viewingProduct.selectedFlavor;
                    let canAddToCart = true;
                    if (selectedFlavorForButton) {
                        canAddToCart = deliveryType === 'selfPickup' && selectedPickupLocation
                            ? isFlavorInStockAtLocation(product, selectedFlavorForButton, selectedPickupLocation)
                            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                    }
                    
                    if (canAddToCart) {
                    return `
                        <button onclick="addToCart(${product.id})" style="width: 100%; padding: 16px; 
                            background: #007AFF; color: white; border: none; border-radius: 12px; 
                            font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 20px;">
                            В корзину
                        </button>
                    `;
                    } else {
                        // Если товар открыт из избранного и информация о наличии уже показана в flavorOptions, не дублируем
                        const isFromFavorites = favoriteFlavor !== null || favoriteStrength !== null;
                        const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                        const flavorLocations = getLocationsWithFlavorStockByCity(product, selectedFlavorForButton, selectedCity);
                        
                        // Показываем информацию о наличии только если она еще не была показана в flavorOptions
                        const showLocationInfo = !isFromFavorites || !favoriteFlavor;
                        
                        return `
                            <div style="margin-top: 20px;">
                                <button disabled style="width: 100%; padding: 16px; 
                                    background: #cccccc; color: white; border: none; border-radius: 12px; 
                                    font-size: 16px; font-weight: 600; cursor: not-allowed; opacity: 0.6;">
                                    Нет в наличии
                                </button>
                                ${showLocationInfo && flavorLocations.length > 0 ? `
                                    <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; font-size: 13px; color: #666; line-height: 1.5;">
                                        <div style="font-weight: 600; margin-bottom: 4px; color: #333;">Есть в наличии на:</div>
                                        <div>${flavorLocations.join(', ')}</div>
                                    </div>
                                ` : (showLocationInfo && flavorLocations.length === 0 ? '<div style="margin-top: 12px; padding: 12px; background: #fff3f3; border-radius: 12px; font-size: 13px; color: #f44336; line-height: 1.5; text-align: center; font-weight: 600;">Товара нет ни на одной точке</div>' : '')}
                            </div>
                        `;
                    }
                }
            })()}
        </div>
    `;
    
    // Плавное появление контейнера
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            
            // Восстанавливаем позицию скролла после перерисовки
            // Используем несколько методов для надежности
            const newScrollHeight = container.scrollHeight || 0;
            if (newScrollHeight > 0 && scrollRatio > 0) {
                // Восстанавливаем по относительной позиции (более надежно)
                container.scrollTop = newScrollHeight * scrollRatio;
            } else if (scrollPosition > 0) {
                // Если не удалось по относительной позиции, используем абсолютную
                container.scrollTop = scrollPosition;
            }
            
            // Восстанавливаем позицию окна (если скроллит вся страница)
            if (windowScrollY > 0) {
                window.scrollTo(0, windowScrollY);
            } else if (documentScrollTop > 0) {
                document.documentElement.scrollTop = documentScrollTop;
            }
            
            // Дополнительные попытки восстановления для надежности
            setTimeout(() => {
                if (newScrollHeight > 0 && scrollRatio > 0) {
                    container.scrollTop = newScrollHeight * scrollRatio;
                } else if (scrollPosition > 0) {
                    container.scrollTop = scrollPosition;
                }
                if (windowScrollY > 0) {
                    window.scrollTo(0, windowScrollY);
                } else if (documentScrollTop > 0) {
                    document.documentElement.scrollTop = documentScrollTop;
                }
            }, 50);
            setTimeout(() => {
                if (newScrollHeight > 0 && scrollRatio > 0) {
                    container.scrollTop = newScrollHeight * scrollRatio;
                } else if (scrollPosition > 0) {
                    container.scrollTop = scrollPosition;
                }
                if (windowScrollY > 0) {
                    window.scrollTo(0, windowScrollY);
                } else if (documentScrollTop > 0) {
                    document.documentElement.scrollTop = documentScrollTop;
                }
            }, 150);
        });
    });
    
    // Инициализируем SVG иконки после загрузки
    setTimeout(() => {
        initSVGIcons();
    }, 100);
}

// Выбор крепости
function selectStrength(strength) {
    if (!viewingProduct) return;
    
    // Сохраняем выбранную крепость
    viewingProduct.selectedStrength = strength;
    
    document.querySelectorAll('[id^="strength-"]').forEach(btn => {
        btn.style.background = '#ffffff';
        btn.style.color = '#000';
        btn.style.borderColor = '#e5e5e5';
    });
    if (event && event.target) {
        event.target.style.background = '#007AFF';
        event.target.style.color = '#ffffff';
        event.target.style.borderColor = '#007AFF';
    }
    
    // Сохраняем состояние товара в localStorage для восстановления при возврате из другой вкладки
    if (currentPage === 'product' && viewingProduct) {
        // Определяем, откуда был открыт товар (из избранного или из каталога)
        const savedProduct = localStorage.getItem('lastViewedProduct');
        let fromPage = 'catalog'; // По умолчанию из каталога
        if (savedProduct) {
            try {
                const productData = JSON.parse(savedProduct);
                if (productData.fromPage) {
                    fromPage = productData.fromPage;
                } else if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
                    fromPage = 'favorites';
                }
            } catch (e) {
                // Если не удалось распарсить, определяем по pageHistory
                if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
                    fromPage = 'favorites';
                }
            }
        } else if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
            fromPage = 'favorites';
        }
        
        localStorage.setItem('lastViewedProduct', JSON.stringify({
            id: viewingProduct.id,
            selectedFlavor: viewingProduct.selectedFlavor,
            selectedStrength: viewingProduct.selectedStrength,
            selectedFlavorIndex: viewingProduct.selectedFlavorIndex,
            fromPage: fromPage
        }));
    }
    
    // Обновляем состояние кнопки избранного в зависимости от текущего выбранного вкуса и крепости
    const product = products.find(p => p.id === viewingProduct.id);
    if (product) {
        const favoriteButton = document.getElementById(`favorite-btn-${product.id}`);
        const heartIcon = document.getElementById(`heart-icon-${product.id}`);
        if (favoriteButton && heartIcon) {
            const currentFlavor = viewingProduct.selectedFlavor || null;
            const isFav = isFavorite(product.id, currentFlavor, strength);
            
            if (isFav) {
                heartIcon.innerHTML = getHeartFilledIcon('#ff4444');
                favoriteButton.style.borderColor = '#ff4444';
                favoriteButton.style.borderWidth = '2px';
            } else {
                heartIcon.innerHTML = getHeartEmptyIcon('#999999');
                favoriteButton.style.borderColor = '#e5e5e5';
                favoriteButton.style.borderWidth = '1px';
            }
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// Выбор вкуса
function selectFlavor(flavor, index) {
    if (!viewingProduct) return;
    
    // Сохраняем выбранный вкус
    const product = products.find(p => p.id === viewingProduct.id);
    if (product && product.flavors) {
        // Убеждаемся что индекс правильный, но НЕ сбрасываем на 0 если вкус недоступен
        let correctIndex = index;
        if (correctIndex === undefined || correctIndex < 0 || correctIndex >= product.flavors.length) {
            correctIndex = product.flavors.indexOf(flavor);
        }
        // ВАЖНО: НЕ сбрасываем индекс на 0, даже если вкус недоступен - сохраняем выбранный вкус
        if (correctIndex < 0) {
            // Если вкус не найден в массиве, пытаемся найти по имени
            correctIndex = product.flavors.indexOf(flavor);
            if (correctIndex < 0) {
                // Если все равно не найден, используем переданный индекс или 0
                correctIndex = index !== undefined && index >= 0 ? index : 0;
            }
        }
        viewingProduct.selectedFlavorIndex = correctIndex;
        viewingProduct.selectedFlavor = flavor;
    } else {
        viewingProduct.selectedFlavorIndex = index !== undefined ? index : 0;
        viewingProduct.selectedFlavor = flavor;
    }
    
    // ВАЖНО: Убеждаемся что мы остаемся на странице товара
    // НЕ вызываем showPage или другие функции которые могут перенаправить
    const container = document.getElementById('page-content');
    
    // Если мы не на странице товара, но viewingProduct существует, значит нужно перерисовать карточку
    if ((!currentPage || currentPage !== 'product') && viewingProduct) {
        // Убеждаемся что мы на странице товара и перерисовываем карточку полностью
        showPage('product', true);
        // Перерисовываем карточку с выбранным вкусом
        setTimeout(() => {
            const pageContent = document.getElementById('page-content');
            if (pageContent && viewingProduct) {
                renderProductContent(pageContent, viewingProduct, null, null);
            }
        }, 50);
        return;
    }
    
    if (container && currentPage === 'product') {
        // ВАЖНО: При клике на недоступный вкус всегда перерисовываем всю карточку,
        // чтобы гарантировать что вся информация о товаре отображается
        // Проверяем наличие выбранного вкуса
        const isProductInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? (flavor ? isFlavorInStockAtLocation(product, flavor, selectedPickupLocation) : isProductInStockAtLocation(product, selectedPickupLocation))
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
        
        // Если вкус недоступен, перерисовываем всю карточку для гарантии отображения всей информации
        // ВАЖНО: Сохраняем позицию скролла перед перерисовкой и восстанавливаем после
        if (!isProductInStock) {
            // Сохраняем позиции скролла (контейнера и окна) ПЕРЕД любыми изменениями
            const scrollPosition = container.scrollTop || 0;
            const scrollHeight = container.scrollHeight || 0;
            const windowScrollY = window.scrollY || window.pageYOffset || 0;
            const documentScrollTop = document.documentElement.scrollTop || 0;
            const scrollRatio = scrollHeight > 0 ? scrollPosition / scrollHeight : 0;
            
            // Используем requestAnimationFrame для плавного обновления без дерганья
            requestAnimationFrame(() => {
                // Временно отключаем переходы для предотвращения дерганья
                const originalTransition = container.style.transition;
                container.style.transition = 'none';
                
                renderProductContent(container, viewingProduct, null, null);
                
                // Восстанавливаем переходы и позицию скролла
                requestAnimationFrame(() => {
                    container.style.transition = originalTransition;
                    const newScrollHeight = container.scrollHeight || 0;
                    // Восстанавливаем скролл контейнера
                    if (newScrollHeight > 0 && scrollRatio > 0) {
                        container.scrollTop = newScrollHeight * scrollRatio;
                    } else if (scrollPosition > 0) {
                        container.scrollTop = scrollPosition;
                    }
                    // Восстанавливаем скролл окна
                    if (windowScrollY > 0) {
                        window.scrollTo({ top: windowScrollY, behavior: 'instant' });
                    } else if (documentScrollTop > 0) {
                        document.documentElement.scrollTop = documentScrollTop;
                    }
                    // Дополнительные попытки восстановления для надежности
                    setTimeout(() => {
                        if (newScrollHeight > 0 && scrollRatio > 0) {
                            container.scrollTop = newScrollHeight * scrollRatio;
                        } else if (scrollPosition > 0) {
                            container.scrollTop = scrollPosition;
                        }
                        if (windowScrollY > 0) {
                            window.scrollTo({ top: windowScrollY, behavior: 'instant' });
                        } else if (documentScrollTop > 0) {
                            document.documentElement.scrollTop = documentScrollTop;
                        }
                    }, 10);
                    setTimeout(() => {
                        if (newScrollHeight > 0 && scrollRatio > 0) {
                            container.scrollTop = newScrollHeight * scrollRatio;
                        } else if (scrollPosition > 0) {
                            container.scrollTop = scrollPosition;
                        }
                        if (windowScrollY > 0) {
                            window.scrollTo({ top: windowScrollY, behavior: 'instant' });
                        } else if (documentScrollTop > 0) {
                            document.documentElement.scrollTop = documentScrollTop;
                        }
                    }, 50);
                });
            });
            return;
        }
        
        // Если вкус доступен, обновляем только отдельные элементы для производительности
        const imageContainer = document.getElementById('product-image-container');
        const productNameDiv = document.getElementById('product-name-display');
        const buttonContainer = document.querySelector('button[onclick*="addToCart"]')?.parentElement || 
                               document.querySelector('button[disabled][style*="Нет в наличии"]')?.parentElement;
        
        // Если основные элементы не найдены, перерисовываем всю карточку
        if (!imageContainer || !productNameDiv || !buttonContainer) {
            renderProductContent(container, viewingProduct, null, null);
            return;
        }
        
        if (imageContainer && product) {
            let productImageUrl = product.imageUrl;
            if (flavor && product.flavorImages && product.flavorImages[flavor]) {
                productImageUrl = product.flavorImages[flavor];
            }
            
            // Проверяем наличие для применения стилей
            const isProductInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? (flavor ? isFlavorInStockAtLocation(product, flavor, selectedPickupLocation) : isProductInStockAtLocation(product, selectedPickupLocation))
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
            
            if (productImageUrl) {
                const img = imageContainer.querySelector('img');
                if (img) {
                    // Обновляем src с timestamp для принудительной перезагрузки
                    const timestamp = Date.now();
                    img.src = productImageUrl + (productImageUrl.includes('?') ? '&' : '?') + 't=' + timestamp;
                    img.style.opacity = isProductInStock ? '1' : '0.5';
                    img.style.filter = isProductInStock ? 'none' : 'grayscale(100%)';
                    img.onerror = function() {
                        imageContainer.innerHTML = getPackageIcon('#999999');
                        imageContainer.style.fontSize = '0';
                        imageContainer.style.display = 'flex';
                        imageContainer.style.alignItems = 'center';
                        imageContainer.style.justifyContent = 'center';
                    };
                } else {
                    imageContainer.innerHTML = `<img src="${productImageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 12px; ${!isProductInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}" onerror="this.parentElement.innerHTML='${getPackageIcon('#999999')}'; this.parentElement.style.fontSize='0'; this.parentElement.style.display='flex'; this.parentElement.style.alignItems='center'; this.parentElement.style.justifyContent='center';">`;
                }
            } else {
                // Если нет изображения, показываем иконку
                imageContainer.innerHTML = getPackageIcon('#999999');
                imageContainer.style.fontSize = '0';
                imageContainer.style.display = 'flex';
                imageContainer.style.alignItems = 'center';
                imageContainer.style.justifyContent = 'center';
            }
            
            // Применяем стили к контейнеру изображения
            imageContainer.style.opacity = isProductInStock ? '1' : '0.5';
            imageContainer.style.filter = isProductInStock ? 'none' : 'grayscale(100%)';
        }
        
        // Обновляем название товара с выбранным вкусом
        if (productNameDiv && product) {
            const displayName = flavor ? `${product.name}, ${flavor}` : product.name;
            productNameDiv.textContent = displayName;
        }
        
        // Обновляем кнопку "В корзину" и информацию о наличии товара
        const addToCartButton = document.querySelector('button[onclick*="addToCart"]');
        const disabledButton = document.querySelector('button[disabled][style*="Нет в наличии"]');
        // buttonContainer уже объявлен выше
        
        if (buttonContainer) {
            const isProductInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? (flavor ? isFlavorInStockAtLocation(product, flavor, selectedPickupLocation) : isProductInStockAtLocation(product, selectedPickupLocation))
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
            
            // Получаем информацию о точках где есть товар
            let locationsWithStock = [];
            if (!isProductInStock && flavor) {
                const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                locationsWithStock = getLocationsWithFlavorStockByCity(product, flavor, selectedCity);
            } else if (!isProductInStock) {
                locationsWithStock = getLocationsWithStock(product);
                const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                if (selectedCity) {
                    locationsWithStock = locationsWithStock.filter(location => {
                        if (selectedCity === 'Минск') {
                            return location.includes('Минск');
                        } else if (selectedCity === 'Могилёв' || selectedCity === 'Могилев') {
                            return location.includes('Могилёв') || location.includes('Могилев');
                        }
                        return true;
                    });
                }
            }
            
            // Удаляем старую кнопку и сообщения
            if (addToCartButton) addToCartButton.remove();
            if (disabledButton) disabledButton.remove();
            const oldMessage = buttonContainer.querySelector('div[style*="Нет в наличии"]');
            if (oldMessage) oldMessage.remove();
            const oldLocationInfo = buttonContainer.querySelector('div[style*="Есть в наличии на:"]');
            if (oldLocationInfo) oldLocationInfo.parentElement.remove();
            
            // Создаем новую кнопку или сообщение
            if (!isProductInStock) {
                const disabledBtn = document.createElement('button');
                disabledBtn.disabled = true;
                disabledBtn.style.cssText = 'width: 100%; padding: 16px; background: #cccccc; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: not-allowed; opacity: 0.6; margin-top: 20px;';
                disabledBtn.textContent = 'Нет в наличии';
                buttonContainer.appendChild(disabledBtn);
                
                // Добавляем информацию о точках где есть товар
                if (locationsWithStock.length > 0) {
                    const locationInfo = document.createElement('div');
                    locationInfo.style.cssText = 'margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; font-size: 13px; color: #666; line-height: 1.5;';
                    locationInfo.innerHTML = `<div style="font-weight: 600; margin-bottom: 4px; color: #333;">Есть в наличии на:</div><div>${locationsWithStock.join(', ')}</div>`;
                    buttonContainer.appendChild(locationInfo);
                } else if (locationsWithStock.length === 0) {
                    const noStockMessage = document.createElement('div');
                    noStockMessage.style.cssText = 'margin-top: 12px; padding: 12px; background: #fff3f3; border-radius: 12px; font-size: 13px; color: #f44336; line-height: 1.5; text-align: center; font-weight: 600;';
                    noStockMessage.textContent = 'Товара нет ни на одной точке';
                    buttonContainer.appendChild(noStockMessage);
                }
            } else {
                const activeBtn = document.createElement('button');
                activeBtn.setAttribute('onclick', `addToCart(${product.id})`);
                activeBtn.style.cssText = 'width: 100%; padding: 16px; background: #007AFF; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 20px;';
                activeBtn.textContent = 'В корзину';
                buttonContainer.appendChild(activeBtn);
            }
        }
        
        // Обновляем визуальное состояние выбранного вкуса БЕЗ перерисовки
        requestAnimationFrame(() => {
            const flavorSection = document.querySelector('[onclick="showFlavorModal()"]')?.closest('div[style*="margin: 20px 0"]');
            if (flavorSection) {
                const flavorsContainer = flavorSection.querySelector('.flavors-scroll-container') || 
                                         flavorSection.querySelector('div[style*="overflow-x: auto"]');
                if (flavorsContainer) {
                    // Плавно убираем выделение со всех
                    flavorsContainer.querySelectorAll('[id^="flavor-"]').forEach(flavorEl => {
                        const circleDiv = flavorEl.querySelector('div[style*="border-radius: 50%"]');
                        const textDiv = flavorEl.querySelector('div[style*="font-size: 12px"]');
                        if (circleDiv) {
                            // Плавный переход для границы
                            circleDiv.style.transition = 'border 0.2s ease, box-shadow 0.2s ease';
                            const currentBorder = window.getComputedStyle(circleDiv).border;
                            if (currentBorder.includes('3px') || currentBorder.includes('#007AFF')) {
                                circleDiv.style.border = '2px solid #e5e5e5';
                                circleDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            }
                            // Плавно удаляем галочку
                            const checkmark = circleDiv.querySelector('div[style*="background: #007AFF"]');
                            if (checkmark) {
                                checkmark.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                                checkmark.style.opacity = '0';
                                checkmark.style.transform = 'translate(-50%, -50%) scale(0.8)';
                                setTimeout(() => checkmark.remove(), 200);
                            }
                        }
                        if (textDiv) {
                            textDiv.style.transition = 'color 0.2s ease, font-weight 0.2s ease';
                            const currentColor = window.getComputedStyle(textDiv).color;
                            if (currentColor.includes('rgb(0, 122, 255)') || currentColor.includes('#007AFF')) {
                                textDiv.style.color = '#000';
                            }
                            textDiv.style.fontWeight = '400';
                        }
                    });
                    
                    // Плавно добавляем выделение к выбранному (даже если недоступен)
                    const selectedFlavorEl = document.getElementById(`flavor-${viewingProduct.selectedFlavorIndex}`);
                    if (selectedFlavorEl) {
                        const circleDiv = selectedFlavorEl.querySelector('div[style*="border-radius: 50%"]');
                        const textDiv = selectedFlavorEl.querySelector('div[style*="font-size: 12px"]');
                        if (circleDiv) {
                            // Плавный переход для границы
                            circleDiv.style.transition = 'border 0.2s ease, box-shadow 0.2s ease';
                            circleDiv.style.border = '3px solid #007AFF';
                            circleDiv.style.boxShadow = '0 2px 8px rgba(0,122,255,0.3)';
                            // Плавно добавляем галочку
                            if (!circleDiv.querySelector('div[style*="background: #007AFF"]')) {
                                const checkmark = document.createElement('div');
                                checkmark.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.8); width: 24px; height: 24px; background: #007AFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transition: opacity 0.2s ease, transform 0.2s ease;';
                                checkmark.innerHTML = '<span style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">✓</span>';
                                circleDiv.appendChild(checkmark);
                                // Плавное появление
                                requestAnimationFrame(() => {
                                    checkmark.style.opacity = '1';
                                    checkmark.style.transform = 'translate(-50%, -50%) scale(1)';
                                });
                            }
                        }
                        if (textDiv) {
                            textDiv.style.transition = 'color 0.2s ease, font-weight 0.2s ease';
                            textDiv.style.color = '#007AFF';
                            textDiv.style.fontWeight = '600';
                        }
                    }
                }
            }
        });
    } else {
        // Если контейнер не найден, пытаемся обновить только изображение
        if (product && product.flavorImages && product.flavorImages[flavor]) {
            const imageContainer = document.getElementById('product-image-container');
            if (imageContainer) {
                const flavorImageUrl = product.flavorImages[flavor];
                // Всегда создаем новый img элемент для гарантированного обновления
                // Используем уникальный timestamp для каждого обновления
                const timestamp = Date.now() + Math.random();
                const newSrc = flavorImageUrl + '?t=' + timestamp;
                
                // Полностью очищаем контейнер
                imageContainer.innerHTML = '';
                
                const newImg = document.createElement('img');
                newImg.src = newSrc;
                newImg.alt = product.name;
                newImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 12px;';
                newImg.onerror = function() {
                    imageContainer.innerHTML = getPackageIcon('#999999');
                    imageContainer.style.fontSize = '0';
                    imageContainer.style.display = 'flex';
                    imageContainer.style.alignItems = 'center';
                    imageContainer.style.justifyContent = 'center';
                };
                newImg.onload = function() {
                    // Убеждаемся, что изображение загрузилось
                    imageContainer.style.fontSize = '0';
                };
                
                imageContainer.appendChild(newImg);
                imageContainer.style.fontSize = '0';
            }
        }
    }
    
    // Обновляем состояние кнопки избранного в зависимости от текущего выбранного вкуса и крепости
    const favoriteButton = document.getElementById(`favorite-btn-${product.id}`);
    const heartIcon = document.getElementById(`heart-icon-${product.id}`);
    if (favoriteButton && heartIcon) {
        const currentStrength = viewingProduct.selectedStrength || null;
        const isFav = isFavorite(product.id, flavor, currentStrength);
        
        if (isFav) {
            heartIcon.innerHTML = getHeartFilledIcon('#ff4444');
            favoriteButton.style.borderColor = '#ff4444';
            favoriteButton.style.borderWidth = '2px';
        } else {
            heartIcon.innerHTML = getHeartEmptyIcon('#999999');
            favoriteButton.style.borderColor = '#e5e5e5';
            favoriteButton.style.borderWidth = '1px';
        }
    }
    
    // Обновляем название товара
    const pageContent = document.getElementById('page-content');
    const productNameDiv = pageContent?.querySelector('#product-name-display');
    if (productNameDiv && product) {
        productNameDiv.textContent = flavor ? `${product.name}, ${flavor}` : product.name;
    }
    
    // Сохраняем состояние товара в localStorage для восстановления при возврате из другой вкладки
    // ВАЖНО: Сохраняем только если мы на странице товара и не переходим никуда
    if (currentPage === 'product' && viewingProduct && pageContent) {
        // Определяем, откуда был открыт товар (из избранного или из каталога)
        const savedProduct = localStorage.getItem('lastViewedProduct');
        let fromPage = 'catalog'; // По умолчанию из каталога
        if (savedProduct) {
            try {
                const productData = JSON.parse(savedProduct);
                if (productData.fromPage) {
                    fromPage = productData.fromPage;
                } else if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
                    fromPage = 'favorites';
                }
            } catch (e) {
                // Если не удалось распарсить, определяем по pageHistory
                if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
                    fromPage = 'favorites';
                }
            }
        } else if (pageHistory.length > 0 && pageHistory[pageHistory.length - 1] === 'favorites') {
            fromPage = 'favorites';
        }
        
        localStorage.setItem('lastViewedProduct', JSON.stringify({
            id: viewingProduct.id,
            selectedFlavor: viewingProduct.selectedFlavor,
            selectedStrength: viewingProduct.selectedStrength,
            selectedFlavorIndex: viewingProduct.selectedFlavorIndex,
            fromPage: fromPage
        }));
    }
    
    // Обновляем только визуальное состояние выбранного вкуса, не пересоздаем весь контейнер
    const flavorSection = document.querySelector('[onclick="showFlavorModal()"]')?.closest('div[style*="margin: 20px 0"]');
    if (flavorSection && viewingProduct) {
        const product = products.find(p => p.id === viewingProduct.id);
        if (product && product.flavors && product.flavors.length > 0) {
            // Ищем контейнер вкусов - только скроллбар, не всю секцию
            const flavorsContainer = flavorSection.querySelector('.flavors-scroll-container') || 
                                     flavorSection.querySelector('div[style*="overflow-x: auto"]');
            
            if (flavorsContainer) {
                // Обновляем только визуальное состояние - убираем выделение со всех, добавляем к выбранному
                requestAnimationFrame(() => {
                    // Убираем выделение со всех вкусов
                    flavorsContainer.querySelectorAll('[id^="flavor-"]').forEach(flavorEl => {
                        const circleDiv = flavorEl.querySelector('div[style*="border-radius: 50%"]');
                        // Ищем галочку разными способами
                        const checkmarkDiv = circleDiv?.querySelector('div[style*="background: #007AFF"]') || 
                                           circleDiv?.querySelector('div[style*="background:#007AFF"]') ||
                                           circleDiv?.querySelector('div[style*="z-index: 10"]') ||
                                           circleDiv?.querySelector('div:has(span)');
                        const textDiv = flavorEl.querySelector('div[style*="font-size: 12px"]');
                        
                        if (circleDiv) {
                            // Убираем синюю рамку - проверяем текущее состояние
                            const currentBorder = circleDiv.style.border || window.getComputedStyle(circleDiv).border;
                            if (currentBorder.includes('3px') || currentBorder.includes('#007AFF')) {
                                circleDiv.style.border = '2px solid #e5e5e5';
                                circleDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            }
                            
                            // Удаляем все возможные варианты галочки
                            const allCheckmarks = circleDiv.querySelectorAll('div');
                            allCheckmarks.forEach(div => {
                                const divStyle = div.style.cssText || window.getComputedStyle(div).cssText;
                                if (divStyle.includes('background: #007AFF') || 
                                    divStyle.includes('background:#007AFF') ||
                                    divStyle.includes('z-index: 10') ||
                                    div.querySelector('span')?.textContent === '✓') {
                                    div.remove();
                                }
                            });
                        }
                        
                        // Убираем синий цвет текста
                        if (textDiv) {
                            const currentColor = textDiv.style.color || window.getComputedStyle(textDiv).color;
                            if (currentColor.includes('rgb(0, 122, 255)') || currentColor.includes('#007AFF')) {
                                textDiv.style.color = '#000';
                                textDiv.style.fontWeight = '400';
                            }
                        }
                    });
                    
                    // Добавляем выделение к выбранному вкусу
                    const selectedFlavorEl = document.getElementById(`flavor-${viewingProduct.selectedFlavorIndex}`);
                    if (selectedFlavorEl) {
                        const circleDiv = selectedFlavorEl.querySelector('div[style*="border-radius: 50%"]');
                        const textDiv = selectedFlavorEl.querySelector('div[style*="font-size: 12px"]');
                        
                        if (circleDiv) {
                            // Добавляем синюю рамку
                            circleDiv.style.border = '3px solid #007AFF';
                            circleDiv.style.boxShadow = '0 2px 8px rgba(0,122,255,0.3)';
                            
                            // Добавляем галочку если её нет
                            if (!circleDiv.querySelector('div[style*="background: #007AFF"]')) {
                                const checkmark = document.createElement('div');
                                checkmark.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; background: #007AFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
                                checkmark.innerHTML = '<span style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">✓</span>';
                                circleDiv.appendChild(checkmark);
                            }
                        }
                        
                        // Делаем текст синим
                        if (textDiv) {
                            textDiv.style.color = '#007AFF';
                            textDiv.style.fontWeight = '600';
                        }
                    }
                });
            }
        }
    }
    
    // Обновляем кнопку "В корзину" в зависимости от наличия выбранного вкуса
    if (pageContent && viewingProduct) {
        const product = products.find(p => p.id === viewingProduct.id);
        if (product) {
            const selectedFlavor = viewingProduct.selectedFlavor;
            let isInStock = false;
            let locationsWithStock = [];
            
            if (selectedFlavor) {
                isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isFlavorInStockAtLocation(product, selectedFlavor, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                
                if (!isInStock) {
                    const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                    locationsWithStock = getLocationsWithFlavorStockByCity(product, selectedFlavor, selectedCity);
                }
            } else {
                isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                    ? isProductInStockAtLocation(product, selectedPickupLocation)
                    : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
                
                if (!isInStock) {
                    locationsWithStock = getLocationsWithStock(product);
                    // Фильтруем по городу если выбран город
                    const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                    if (selectedCity) {
                        locationsWithStock = locationsWithStock.filter(location => {
                            if (selectedCity === 'Минск') {
                                return location.includes('Минск');
                            } else if (selectedCity === 'Могилёв' || selectedCity === 'Могилев') {
                                return location.includes('Могилёв') || location.includes('Могилев');
                            }
                            return true;
                        });
                    }
                }
            }
            
            // Ищем кнопку "В корзину" или disabled кнопку
            const addToCartButton = pageContent.querySelector('button[onclick*="addToCart"]');
            const disabledButton = pageContent.querySelector('button[disabled]');
            const buttonContainer = addToCartButton?.parentElement || disabledButton?.parentElement;
            
            if (buttonContainer) {
                if (!isInStock) {
                    // Заменяем кнопку на disabled
                    const locationsHtml = locationsWithStock.length > 0 ? `
                        <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; font-size: 13px; color: #666; line-height: 1.5;">
                            <div style="font-weight: 600; margin-bottom: 4px; color: #333;">Есть в наличии на:</div>
                            <div>${locationsWithStock.join(', ')}</div>
                                </div>
                    ` : '<div style="margin-top: 12px; padding: 12px; background: #fff3f3; border-radius: 12px; font-size: 13px; color: #f44336; line-height: 1.5; text-align: center; font-weight: 600;">Товара нет ни на одной точке</div>';
                    buttonContainer.innerHTML = `
                        <button disabled style="width: 100%; padding: 16px; 
                            background: #cccccc; color: white; border: none; border-radius: 12px; 
                            font-size: 16px; font-weight: 600; cursor: not-allowed; opacity: 0.6;">
                            Нет в наличии
                        </button>
                        ${locationsHtml}
                    `;
                } else {
                    // Восстанавливаем кнопку если товар в наличии
                    if (disabledButton || !addToCartButton) {
                        buttonContainer.innerHTML = `
                            <button onclick="addToCart(${product.id})" style="width: 100%; padding: 16px; 
                                background: #007AFF; color: white; border: none; border-radius: 12px; 
                                font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 20px;">
                                В корзину
                            </button>
                        `;
                    }
                }
            }
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// Модальное окно вкусов
function showFlavorModal() {
    if (!viewingProduct) return;
    // Проверяем наличие вкусов - если их нет, просто возвращаемся
    if (!viewingProduct.flavors || viewingProduct.flavors.length === 0) {
        return;
    }
    
    // Удаляем предыдущее модальное окно если есть
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'background: white; padding: 20px; border-radius: 12px; max-width: 90%; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
    
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 20px; font-weight: 700;';
    title.textContent = 'Вкус';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: #999;';
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        // Показываем кнопку "Назад" вместо скрытия
        tg.BackButton.show();
        tg.BackButton.onClick(function() {
            // Закрываем модальное окно и возвращаемся в ассортимент
            closeModal();
        });
    }
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Если мы на странице товара, показываем кнопку "Назад"
            if (currentPage === 'product') {
                tg.BackButton.show();
            } else {
                // На других страницах скрываем кнопку
                if (currentPage === 'catalog' || currentPage === 'cart' || currentPage === 'favorites' || currentPage === 'profile' || currentPage === 'promotions') {
                    tg.BackButton.hide();
                } else {
                tg.BackButton.show();
                }
            }
        }
        
        // Плавное закрытие
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            document.body.style.overflow = '';
            modal.remove();
        }, 300);
    };
    
    closeBtn.onclick = closeModal;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    modalContent.appendChild(header);
    
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-height: 60vh; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;';
    grid.className = 'flavors-modal-container';
    
    // Сохраняем выбранный вкус если есть
    let selectedFlavorIndex = viewingProduct.selectedFlavorIndex !== undefined ? viewingProduct.selectedFlavorIndex : 0;
    const selectedFlavor = viewingProduct.selectedFlavor || viewingProduct.flavors[selectedFlavorIndex];
    
    // Сортируем вкусы - сначала в наличии, потом не в наличии
    const sortedFlavors = [...viewingProduct.flavors].sort((a, b) => {
        const aInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(viewingProduct, a, selectedPickupLocation)
            : (viewingProduct.inStock !== false && (viewingProduct.quantity === undefined || viewingProduct.quantity > 0));
        const bInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(viewingProduct, b, selectedPickupLocation)
            : (viewingProduct.inStock !== false && (viewingProduct.quantity === undefined || viewingProduct.quantity > 0));
        
        // Сначала вкусы в наличии (true идет перед false)
        if (aInStock !== bInStock) {
            return bInStock ? 1 : -1;
        }
        return 0;
    });
    
    // Сохраняем состояние выбранного вкуса на уровне модального окна
    let currentlySelectedFlavor = selectedFlavor;
    let currentlySelectedIndex = selectedFlavorIndex;
    
        sortedFlavors.forEach((flavor, displayIdx) => {
        const originalIndex = viewingProduct.flavors.indexOf(flavor);
        const isInitiallySelected = flavor === selectedFlavor || originalIndex === selectedFlavorIndex;
        
        // Проверяем наличие вкуса на выбранной точке
        const isFlavorInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(viewingProduct, flavor, selectedPickupLocation)
            : (viewingProduct.inStock !== false && (viewingProduct.quantity === undefined || viewingProduct.quantity > 0));
        
        // Получаем список точек, где есть этот вкус (отфильтрованный по городу выбранной точки)
        const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
        const flavorLocations = !isFlavorInStock ? getLocationsWithFlavorStockByCity(viewingProduct, flavor, selectedCity) : [];
        
        const flavorCard = document.createElement('div');
        const borderColor = isInitiallySelected ? '#007AFF' : (!isFlavorInStock ? '#999' : '#e5e5e5');
        const bgColor = isInitiallySelected ? '#007AFF' : (!isFlavorInStock ? '#f5f5f5' : '#ffffff');
        flavorCard.style.cssText = 'padding: 12px; border: 2px solid ' + borderColor + '; border-radius: 12px; background: ' + bgColor + '; cursor: pointer; text-align: center; touch-action: manipulation; user-select: none; -webkit-user-select: none; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; ' + (!isFlavorInStock ? 'opacity: 0.7;' : '');
        
        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = 'width: 70px; height: 70px; border-radius: 50%; background: ' + (!isFlavorInStock ? '#e0e0e0' : '#f0f0f0') + '; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; flex-shrink: 0;';
        
        // Определяем изображение для вкуса
        const flavorImage = (viewingProduct.flavorImages && viewingProduct.flavorImages[flavor]) 
            ? viewingProduct.flavorImages[flavor] 
            : (viewingProduct.imageUrl || null);
        
        if (flavorImage) {
            const img = document.createElement('img');
            img.src = flavorImage;
            img.alt = flavor;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;' + (!isFlavorInStock ? ' opacity: 0.5; filter: grayscale(100%);' : '');
            img.onerror = function() {
                iconDiv.innerHTML = getPackageIcon('#999999');
                iconDiv.style.fontSize = '0';
            };
            iconDiv.appendChild(img);
        } else {
            iconDiv.innerHTML = getPackageIcon('#999999');
        }
        
        
        const textDiv = document.createElement('div');
        const textColor = isInitiallySelected ? '#ffffff' : (!isFlavorInStock ? '#999' : '#000');
        textDiv.style.cssText = 'font-size: 13px; font-weight: 500; color: ' + textColor + '; min-height: 18px; display: block; white-space: normal; word-wrap: break-word; text-align: center; position: relative; z-index: 100; visibility: visible; opacity: 1; background: transparent; pointer-events: none; padding: 2px 0; width: 100%; line-height: 1.3;';
        textDiv.textContent = flavor;
        textDiv.title = flavor; // Показываем полный текст при наведении
        
        // Добавляем текст "Нет в наличии" если вкус не в наличии
        if (!isFlavorInStock) {
            const stockText = document.createElement('div');
            stockText.style.cssText = 'font-size: 11px; color: #999; margin-top: 4px;';
            stockText.textContent = 'Нет в наличии';
            textDiv.appendChild(stockText);
        }
        
        flavorCard.appendChild(iconDiv);
        flavorCard.appendChild(textDiv);
        
        // Обработчики событий - один клик сразу выбирает вкус и закрывает окно
        // Если вкус не в наличии, открываем карточку товара с этим вкусом
        let isProcessing = false;
        const handleSelect = function(e) {
            if (isProcessing) return;
            isProcessing = true;
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Сохраняем выбранный индекс (оригинальный индекс в массиве)
            viewingProduct.selectedFlavorIndex = originalIndex;
            viewingProduct.selectedFlavor = flavor;
            
            // Плавно обновляем визуальное состояние в модальном окне - выделяем выбранный вкус
            grid.querySelectorAll('div[style*="border-radius: 12px"]').forEach(card => {
                const cardBorder = card.style.border || window.getComputedStyle(card).border;
                if (cardBorder.includes('#007AFF')) {
                    card.style.transition = 'border 0.2s ease, background 0.2s ease';
                    card.style.border = '2px solid #e5e5e5';
                    card.style.background = '#ffffff';
                    const textDiv = card.querySelector('div[style*="font-size: 13px"]');
                    if (textDiv) {
                        textDiv.style.transition = 'color 0.2s ease';
                        textDiv.style.color = '#000';
                    }
                }
            });
            // Плавно выделяем выбранный вкус (даже если недоступен)
            flavorCard.style.transition = 'border 0.2s ease, background 0.2s ease';
            flavorCard.style.border = '2px solid #007AFF';
            flavorCard.style.background = '#007AFF';
            const selectedTextDiv = flavorCard.querySelector('div[style*="font-size: 13px"]');
            if (selectedTextDiv) {
                selectedTextDiv.style.transition = 'color 0.2s ease';
                selectedTextDiv.style.color = '#ffffff';
            }
            
            // Применяем выбранный вкус и закрываем окно с плавной анимацией
            selectFlavor(flavor, originalIndex);
            
            // Плавно закрываем модальное окно
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modal.style.transition = 'opacity 0.2s ease';
                modal.style.opacity = '0';
                modalContent.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                modalContent.style.transform = 'scale(0.95)';
                modalContent.style.opacity = '0';
            }
            
            setTimeout(() => {
                document.body.style.overflow = '';
                modal.remove();
                
                // Плавно скроллим к выбранному вкусу в скроллбаре (работает и для недоступных вкусов)
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const flavorSection = document.querySelector('[onclick="showFlavorModal()"]')?.closest('div[style*="margin: 20px 0"]');
                        if (flavorSection) {
                            // Используем originalIndex для поиска элемента (работает для всех вкусов, включая недоступные)
                            const flavorElement = document.getElementById(`flavor-${originalIndex}`);
                            if (flavorElement) {
                                const flavorsContainer = flavorSection.querySelector('.flavors-scroll-container') || 
                                                         flavorSection.querySelector('div[style*="overflow-x: auto"]');
                                if (flavorsContainer) {
                                    // Плавно скроллим к выбранному вкусу (даже если он недоступен)
                                    const elementLeft = flavorElement.offsetLeft;
                                    const elementWidth = flavorElement.offsetWidth;
                                    const containerWidth = flavorsContainer.offsetWidth;
                                    const scrollLeft = flavorsContainer.scrollLeft;
                                    const elementCenter = elementLeft + elementWidth / 2;
                                    const containerCenter = scrollLeft + containerWidth / 2;
                                    const targetScroll = elementCenter - containerWidth / 2;
                                    
                                    flavorsContainer.scrollTo({
                                        left: targetScroll,
                                        behavior: 'smooth'
                                    });
                                }
                            }
                        }
                    }, 200); // Увеличиваем задержку для надежности
                });
            }, 200);
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            setTimeout(() => {
                isProcessing = false;
            }, 500);
            
            return false;
        };
        
        // Отслеживаем начало касания для различения клика и скролла
        let touchStartY = 0;
        let touchStartTime = 0;
        let isScrolling = false;
        
        flavorCard.addEventListener('touchstart', function(e) {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            isScrolling = false;
        }, {passive: true});
        
        flavorCard.addEventListener('touchmove', function(e) {
            const touchY = e.touches[0].clientY;
            const deltaY = Math.abs(touchY - touchStartY);
            if (deltaY > 10) {
                isScrolling = true;
            }
        }, {passive: true});
        
        flavorCard.addEventListener('touchend', function(e) {
            const touchDuration = Date.now() - touchStartTime;
            const touchY = e.changedTouches[0].clientY;
            const deltaY = Math.abs(touchY - touchStartY);
            
            // Если это был скролл (большое перемещение или долгое касание), не выбираем вкус
            if (isScrolling || deltaY > 10 || touchDuration > 300) {
                return;
            }
            
            e.preventDefault();
            handleSelect(e);
        }, {passive: false, once: true});
        
        flavorCard.addEventListener('click', function(e) {
            // Проверяем, не был ли это скролл
            if (!isScrolling) {
                handleSelect(e);
            }
        }, {once: true});
        
        grid.appendChild(flavorCard);
    });
    
    modalContent.appendChild(grid);
    modal.appendChild(modalContent);
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            // Плавное закрытие
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
            document.body.style.overflow = '';
            modal.remove();
            }, 300);
        }
    }, true);
    
    document.body.appendChild(modal);
    
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden';
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
        
        // Прокручиваем к выбранному вкусу после открытия модального окна
        setTimeout(() => {
            // Используем актуальный выбранный вкус из viewingProduct
            const currentSelectedFlavor = viewingProduct.selectedFlavor || selectedFlavor;
            // Находим выбранный вкус в модальном окне по имени
            const selectedFlavorCard = Array.from(grid.children).find((card) => {
                const flavorText = card.querySelector('div[style*="font-size: 13px"]');
                if (flavorText) {
                    const flavorName = flavorText.textContent.trim();
                    // Проверяем по имени вкуса
                    return flavorName === currentSelectedFlavor || flavorName === selectedFlavor;
                }
                return false;
            });
            
            if (selectedFlavorCard) {
                // Прокручиваем к выбранному вкусу
                selectedFlavorCard.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                });
            }
        }, 300);
    });
    
    // Восстанавливаем прокрутку при закрытии
    const observer = new MutationObserver(function() {
        if (!document.querySelector('.modal-overlay')) {
            document.body.style.overflow = '';
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function selectFlavorFromModal(flavor, flavorIndex) {
    // Эта функция больше не используется для закрытия окна
    // Выбор вкуса теперь происходит прямо в модальном окне
    // Окно закрывается только по кнопке "Готово" или крестику
    console.log('Flavor selected in modal:', flavor, 'index:', flavorIndex);
}

// Анимация добавления в корзину
function animateAddToCart(product, startElement, callback) {
    // Находим иконку корзины
    const cartIcon = document.querySelector('.nav-item[onclick*="cart"]');
    if (!cartIcon || !startElement) {
        // Если не нашли элементы, просто вызываем callback
        if (callback) callback();
        return;
    }
    
    // Получаем координаты начальной точки
    const startRect = startElement.getBoundingClientRect();
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    
    // Получаем координаты конечной точки (иконка корзины)
    const endRect = cartIcon.getBoundingClientRect();
    const endX = endRect.left + endRect.width / 2;
    const endY = endRect.top + endRect.height / 2;
    
    // Создаем элемент анимации
    const flyElement = document.createElement('div');
    flyElement.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        width: 60px;
        height: 60px;
        z-index: 10000;
        pointer-events: none;
        transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        opacity: 1;
    `;
    
    // Определяем содержимое (изображение или emoji)
    if (product.imageUrl) {
        flyElement.innerHTML = `<img src="${product.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.parentElement.innerHTML='${product.image || product.emoji}'; this.parentElement.style.fontSize='40px';">`;
    } else {
        flyElement.innerHTML = product.image || product.emoji || '📦';
        flyElement.style.fontSize = '40px';
    }
    
    document.body.appendChild(flyElement);
    
    // Запускаем анимацию
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            flyElement.style.left = `${endX}px`;
            flyElement.style.top = `${endY}px`;
            flyElement.style.transform = 'translate(-50%, -50%) scale(0.3)';
            flyElement.style.opacity = '0.8';
        });
    });
    
    // Анимация иконки корзины при достижении товара
    const cartBadge = document.getElementById('cart-badge');
    const originalScale = cartIcon.style.transform || 'scale(1)';
    
    setTimeout(() => {
        // Увеличиваем иконку корзины
        cartIcon.style.transition = 'transform 0.2s ease-out';
        cartIcon.style.transform = 'scale(1.2)';
        
        // Анимация badge
        if (cartBadge) {
            cartBadge.style.transition = 'transform 0.2s ease-out';
            cartBadge.style.transform = 'scale(1.3)';
        }
        
        // Возвращаем обратно
        setTimeout(() => {
            cartIcon.style.transform = originalScale;
            if (cartBadge) {
                cartBadge.style.transform = 'scale(1)';
            }
        }, 200);
    }, 400);
    
    // Удаляем элемент после анимации и вызываем callback
    setTimeout(() => {
        flyElement.remove();
        if (callback) callback();
    }, 600);
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// Вычислить цену товара в коинах
function calculateVapeCoinsPrice(price, customVapeCoinsPrice = null) {
    // Если указана явная цена в коинах, используем её
    // Иначе вычисляем: price * 1 (18 BYN = 18 коинов, пропорционально начислению)
    if (customVapeCoinsPrice !== undefined && customVapeCoinsPrice !== null) {
        return customVapeCoinsPrice;
    }
    return price * 1; // Цена в коинах равна цене в BYN
}

// Добавить в корзину
function addToCart(productId, strength = null, flavor = null) {
    // Блокируем повторные вызовы при быстром нажатии
    if (isAddingToCart) {
        return;
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Используем выбранные пользователем значения из viewingProduct, если они есть
    let selectedStrength = strength;
    let selectedFlavor = flavor;
    
    // Если viewingProduct существует и это тот же товар, используем его выбранные значения
    if (viewingProduct && viewingProduct.id === productId) {
        if (!selectedStrength && viewingProduct.selectedStrength) {
            selectedStrength = viewingProduct.selectedStrength;
        }
        if (!selectedFlavor && viewingProduct.selectedFlavor) {
            selectedFlavor = viewingProduct.selectedFlavor;
        }
    }
    
    // Проверяем наличие товара или конкретного вкуса на выбранной точке самовывоза
    let isInStock = false;
    if (selectedFlavor) {
        // Проверяем наличие конкретного вкуса
        isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(product, selectedFlavor, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    } else {
        // Проверяем общее наличие товара
        isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(product, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    }
    
    if (!isInStock) {
        const message = selectedFlavor 
            ? `На данной точке этого товара нет` 
            : 'На данной точке этого товара нет';
        showToast(message, 'error', 3000);
        return;
    }
    
    // Устанавливаем флаг блокировки
    isAddingToCart = true;
    
    // Если все еще нет выбранных значений, используем первые из массивов
    if (!selectedStrength && product.strengths && product.strengths.length > 0) {
        selectedStrength = product.strengths[0];
    }
    if (!selectedFlavor && product.flavors && product.flavors.length > 0) {
        selectedFlavor = product.flavors[0];
    }
    
    // Вычисляем vapeCoinsPrice используя единую формулу
    const coinsPrice = calculateVapeCoinsPrice(product.price, product.vapeCoinsPrice);
    
    // Всегда по умолчанию используем деньги
    let defaultPaymentMethod = 'money';
    
    // Проверяем, есть ли уже такой товар в корзине с теми же параметрами
    const existingItemIndex = cart.findIndex(item => 
        item.id === productId && 
        item.strength === (selectedStrength || null) && 
        item.flavor === (selectedFlavor || null)
    );
    
    if (existingItemIndex !== -1) {
        // Если товар уже есть, проверяем ограничение на 9 товаров
        if (cart[existingItemIndex].quantity >= 9) {
            showToast('Максимальное количество товара одного вида: 9 шт.', 'error', 3000);
            isAddingToCart = false;
            return;
        }
        
        // Увеличиваем количество
        cart[existingItemIndex].quantity += 1;
        localStorage.setItem('cart', JSON.stringify(cart));
        syncCartToServer(); // Синхронизируем с сервером
        updateCartBadge();
        showToast('Количество товара увеличено', 'success', 2000);
        
        // Если пользователь на странице корзины, обновляем итого сразу
        if (currentPage === 'cart') {
            // Обновляем количество товаров и итого без полной перерисовки
            updateCartItemsDisplay();
            updateCartTotals();
        }
        
        isAddingToCart = false; // Снимаем блокировку
        return;
    }
    
    // Если товара нет, создаем новый элемент
    const cartItem = {
        ...product,
        strength: selectedStrength || null,
        flavor: selectedFlavor || null,
        quantity: 1,
        vapeCoinsPrice: coinsPrice,
        paymentMethod: defaultPaymentMethod // 'money' или 'coins'
    };
    
    // Находим элемент, от которого будет анимация
    let startElement = null;
    if (viewingProduct && viewingProduct.id === productId) {
        // Если мы на странице товара, используем контейнер изображения товара
        // Ищем первый div внутри page-content, который содержит изображение товара
        const pageContent = document.getElementById('page-content');
        if (pageContent) {
            // Ищем первый div с высотой 300px (контейнер изображения товара)
            const productImageContainer = pageContent.querySelector('div > div:first-child');
            if (productImageContainer) {
                startElement = productImageContainer;
            } else {
                // Запасной вариант - кнопка "В корзину"
                const addButton = document.querySelector('button[onclick*="addToCart"]');
                if (addButton) {
                    startElement = addButton;
                }
            }
        }
    } else {
        // Если в каталоге, используем карточку товара по data-атрибуту
        const productImage = document.querySelector(`.product-image[data-product-id="${productId}"]`);
        if (productImage) {
            startElement = productImage;
        } else {
            // Запасной вариант - ищем карточку товара
            const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
            if (productCard) {
                const cardImage = productCard.querySelector('.product-image');
                if (cardImage) startElement = cardImage;
            }
        }
    }
    
    // ВАЖНО: Проверяем общее количество позиций одного товара (все варианты вкуса/крепости)
    // Делаем это ДО анимации, чтобы не тратить время на анимацию если товар не добавится
    const totalQuantityOfProduct = cart
        .filter(item => item.id === productId)
        .reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    // Если уже есть 9 или больше позиций этого товара (всех вариантов), не добавляем
    if (totalQuantityOfProduct >= 9) {
        showToast('Максимальное количество товара одного вида: 9 шт.', 'error', 3000);
        isAddingToCart = false;
        return;
    }
    
    // Запускаем анимацию, затем добавляем в корзину
    animateAddToCart(product, startElement, () => {
        cart.push(cartItem);
        localStorage.setItem('cart', JSON.stringify(cart));
        syncCartToServer(); // Синхронизируем с сервером
        updateCartBadge();
        showToast('Товар добавлен в корзину', 'success', 2000);
        
        // Если пользователь на странице корзины, обновляем итого сразу
        if (currentPage === 'cart') {
            // Обновляем количество товаров и итого без полной перерисовки
            updateCartItemsDisplay();
            updateCartTotals();
        }
        
        // Снимаем блокировку после небольшой задержки
        setTimeout(() => {
            isAddingToCart = false;
        }, 500);
    });
}

// Обработка ошибок загрузки изображений
function handleImageError(imgId) {
    const img = document.getElementById(imgId);
    if (img && img.parentElement) {
        // Убираем обработчик ошибки чтобы избежать бесконечного цикла
        img.onerror = null;
        
        // Пробуем загрузить с другим расширением (.jpg -> .JPG или наоборот)
        const currentSrc = img.src;
        if (currentSrc.includes('/images/')) {
            const imageNumber = currentSrc.match(/\/images\/(\d+)\.(jpg|JPG)/i);
            if (imageNumber) {
                const num = imageNumber[1];
                const currentExt = imageNumber[2];
                // Пробуем противоположное расширение
                const newExt = currentExt.toLowerCase() === 'jpg' ? 'JPG' : 'jpg';
                const newSrc = `/images/${num}.${newExt}`;
                
                // Пробуем загрузить с новым расширением
                const newImg = new Image();
                newImg.onload = function() {
                    img.src = newSrc;
                    img.style.display = 'block';
                };
                newImg.onerror = function() {
                    // Если и это не сработало, показываем иконку
        img.style.display = 'none';
        const parent = img.parentElement;
                    if (!parent.querySelector('svg')) {
        parent.innerHTML = getPackageIcon('#999999');
        parent.style.display = 'flex';
                        parent.style.alignItems = 'center';
                        parent.style.justifyContent = 'center';
                    }
                };
                newImg.src = newSrc;
                return;
            }
        }
        
        // Если не удалось определить номер изображения, показываем иконку
        img.style.display = 'none';
        const parent = img.parentElement;
        // Проверяем что это не уже иконка
        if (!parent.querySelector('svg')) {
            parent.innerHTML = getPackageIcon('#999999');
            parent.style.display = 'flex';
            parent.style.alignItems = 'center';
            parent.style.justifyContent = 'center';
        }
        parent.style.alignItems = 'center';
        parent.style.justifyContent = 'center';
    }
}

// Обновить значок корзины
function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    
    const count = cart.length;
    
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Фильтр по категориям
function filterCategory(category) {
    currentCategory = category;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Плавное обновление продуктов
    displayProducts();
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Поиск товаров
function searchProducts(query) {
    if (!query.trim()) {
        displayProducts();
        return;
    }
    
    const filtered = products.filter(product => 
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(query.toLowerCase()))
    );
    
    displayProducts(filtered);
}

// Скрыть клавиатуру
function hideKeyboard() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.blur();
        // В Telegram Web App используем специальный метод
        if (tg && tg.isExpanded) {
            // Просто убираем фокус
            document.activeElement?.blur();
        }
    }
    document.body.classList.remove('keyboard-open');
}

// Обработка клавиатуры
function handleKeyboard() {
    const searchInput = document.getElementById('search-input');
    const bottomNav = document.querySelector('.bottom-nav');
    
    if (searchInput) {
        searchInput.addEventListener('focus', function() {
            // Убираем padding-bottom у body
            document.body.style.paddingBottom = '0';
            // Фиксируем нижнюю панель внизу экрана
            if (bottomNav) {
                bottomNav.style.position = 'fixed';
                bottomNav.style.bottom = '0';
                bottomNav.style.zIndex = '1000';
            }
        });
        
        searchInput.addEventListener('blur', function() {
            // Восстанавливаем padding-bottom
            document.body.style.paddingBottom = '70px';
            document.body.classList.remove('keyboard-open');
            if (bottomNav) {
                bottomNav.style.position = 'fixed';
                bottomNav.style.bottom = '0';
            }
        });
        
        // Обработка Enter
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                hideKeyboard();
            }
        });
    }
}

// Делаем функцию глобальной
window.hideKeyboard = hideKeyboard;

// Меню сортировки
function showSortMenu() {
    // Всегда показываем выбор, независимо от текущей сортировки
    const options = [
        { id: 'price_asc', text: 'Сначала дешевые' },
        { id: 'price_desc', text: 'Сначала дорогие' }
    ];
    
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: 'Сортировка',
            message: 'Выберите способ сортировки',
            buttons: options.map(opt => ({
                id: opt.id,
                type: sortOrder === opt.id ? 'default' : 'default',
                text: opt.text
            }))
        }, (btnId) => {
            if (btnId) {
                sortOrder = btnId;
                displayProducts();
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            }
        });
    } else {
        // Запасной вариант
        if (confirm('Сначала дешевые? (OK - да, Cancel - дорогие)')) {
            sortOrder = 'price_asc';
        } else {
            sortOrder = 'price_desc';
        }
        displayProducts();
    }
}

// Выбор точки самовывоза в корзине
function selectPickupLocation() {
    console.log('selectPickupLocation called');
    
    // Структура локаций по городам
    const cities = {
        'Минск': [
            'ст. м. Грушевка',
            'ст. м. Площадь Победы',
            'ст. м. Немига',
            'ст. м. Октябрьская',
            'ст. м. Партизанская',
            'ст. м. Тракторный завод'
        ],
        'Могилёв': [
            'ул. Ленинская, 20',
            'пр-т Мира, 15',
            'ул. Первомайская, 8',
            'ул. Челюскинцев, 12'
        ]
    };
    
    // Удаляем предыдущее модальное окно если есть
    const existingModal = document.querySelector('.location-modal-overlay');
    if (existingModal) existingModal.remove();
    
    // Функция для создания элемента выбора
    function createSelectItem(text, isSelected, onClick) {
        const item = document.createElement('div');
        const borderColor = isSelected ? '#007AFF' : '#e5e5e5';
        const bgColor = isSelected ? '#f0f8ff' : '#ffffff';
        item.style.cssText = 'padding: 16px; border: 2px solid ' + borderColor + '; border-radius: 12px; background: ' + bgColor + '; cursor: pointer; display: flex; align-items: center; gap: 12px; touch-action: manipulation; word-wrap: break-word; overflow-wrap: break-word;';
        
        // Кружок слева
        const circle = document.createElement('div');
        const circleBorderColor = isSelected ? '#007AFF' : '#999';
        const circleBgColor = isSelected ? '#007AFF' : 'transparent';
        circle.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; border: 2px solid ' + circleBorderColor + '; background: ' + circleBgColor + '; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
        if (isSelected) {
            const innerCircle = document.createElement('div');
            innerCircle.style.cssText = 'width: 10px; height: 10px; border-radius: 50%; background: white;';
            circle.appendChild(innerCircle);
        }
        
        // Текст
        const textDiv = document.createElement('div');
        const textWeight = isSelected ? '600' : '500';
        const textColor = isSelected ? '#007AFF' : '#000';
        textDiv.style.cssText = 'font-size: 16px; font-weight: ' + textWeight + '; color: ' + textColor + '; flex: 1; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; min-width: 0;';
        textDiv.textContent = text;
        
        item.appendChild(circle);
        item.appendChild(textDiv);
        
        // Обработчик клика
        const handleSelect = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onClick();
        };
        
        item.addEventListener('click', handleSelect, true);
        item.addEventListener('touchend', handleSelect, {passive: false, capture: true});
        item.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        }, {passive: false});
        
        return item;
    }
    
    // Функция для показа списка городов
    function showCitySelection() {
        // Сохраняем обработчик BackButton для восстановления
        let originalBackButtonHandler = null;
        if (tg && tg.BackButton) {
            originalBackButtonHandler = tg.BackButton.onClick;
            tg.BackButton.hide();
        }
        
        const modal = document.createElement('div');
        modal.className = 'location-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'location-modal-content';
        modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
        
        // Заголовок
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 20px;';
        header.innerHTML = '<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">📍 Выберите город</div><div style="font-size: 14px; color: #666;">Выберите город для самовывоза</div>';
        modalContent.appendChild(header);
        
        // Список городов
        const citiesList = document.createElement('div');
        citiesList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
        
        Object.keys(cities).forEach((cityName) => {
            const cityItem = createSelectItem(cityName, false, function() {
                // При выборе города показываем точки этого города
                showLocationsForCity(cityName, cities[cityName], modal);
            });
            citiesList.appendChild(cityItem);
        });
        
        modalContent.appendChild(citiesList);
        modal.appendChild(modalContent);
        
        const closeModal = function() {
            // Восстанавливаем кнопку "Назад"
            if (tg && tg.BackButton && originalBackButtonHandler) {
                tg.BackButton.onClick(originalBackButtonHandler);
                // Показываем кнопку "Назад" если нужно
                if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                    tg.BackButton.show();
                }
            }
            
            // Плавное закрытие
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        };
        
        // Блокируем прокрутку страницы
        const preventScroll = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        modal.addEventListener('wheel', preventScroll, {passive: false});
        modal.addEventListener('touchmove', preventScroll, {passive: false});
        
        // Закрытие при клике на фон
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        }, true);
        
        // Устанавливаем обработчик BackButton
        if (tg && tg.BackButton) {
            tg.BackButton.onClick(function() {
                // Блокируем кнопку "Назад" - закрываем модальное окно
                closeModal();
            });
        }
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Плавное появление модального окна
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
        });
        
        return modal;
    }
    
    // Функция для показа точек в выбранном городе
    function showLocationsForCity(cityName, locations, previousModal) {
        // Удаляем предыдущее модальное окно
        if (previousModal) previousModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'location-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'location-modal-content';
        modalContent.style.cssText = 'background: white; padding: 20px; border-radius: 14px; width: 85%; max-width: 360px; min-width: 320px; max-height: 75vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
        
        // Заголовок с кнопкой назад
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 20px; display: flex; align-items: center; gap: 12px;';
        
        const backBtn = document.createElement('button');
        backBtn.textContent = '←';
        backBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
        backBtn.onclick = function() {
            // Плавное закрытие
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
                showCitySelection();
            }, 300);
        };
        
        const headerText = document.createElement('div');
        headerText.style.cssText = 'flex: 1;';
        headerText.innerHTML = '<div style="font-size: 22px; font-weight: 700; margin-bottom: 6px;">📍 ' + cityName + '</div><div style="font-size: 14px; color: #666;">Выберите точку самовывоза</div>';
        
        header.appendChild(backBtn);
        header.appendChild(headerText);
        modalContent.appendChild(header);
        
        // Список точек
        const locationsList = document.createElement('div');
        locationsList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
        
        locations.forEach((locationName) => {
            const fullLocation = cityName + ', ' + locationName;
            const isSelected = fullLocation === selectedPickupLocation;
            const locationItem = createSelectItem(locationName, isSelected, function() {
                // Обновляем выбранную точку самовывоза
                const previousLocation = selectedPickupLocation;
                selectedPickupLocation = fullLocation;
                localStorage.setItem('selectedPickupLocation', selectedPickupLocation);
                
                // Если точка изменилась, сбрасываем время
                if (previousLocation !== selectedPickupLocation) {
                    deliveryTime = null;
                    deliveryExactTime = null;
                    selectedDeliveryDay = null;
                    localStorage.removeItem('deliveryTime');
                    localStorage.removeItem('deliveryExactTime');
                    localStorage.removeItem('selectedDeliveryDay');
                    
                    // Обновляем отображение времени в корзине если мы на странице корзины
                    if (currentPage === 'cart') {
                        const timeDisplay = document.getElementById('selected-delivery-time-display');
                        if (timeDisplay) {
                            timeDisplay.textContent = 'Выбрать время';
                        }
                    }
                    
                    // Если мы на странице товара, обновляем карточку товара
                    if (currentPage === 'product' && viewingProduct) {
                        renderProductContent(document.getElementById('page-content'), viewingProduct, null, null);
                    }
                    
                }
                
                // Обновляем отображение точки в шапке
                updatePickupLocationDisplay();
                
                // Обновляем отображение точки в корзине если мы на странице корзины
                if (currentPage === 'cart') {
                    const locationDisplay = document.getElementById('selected-pickup-location-display');
                    if (locationDisplay) {
                        locationDisplay.textContent = selectedPickupLocation;
                    }
                }
                
                // Всегда обновляем отображение товаров на странице каталога
                // Это важно, особенно при первом выборе точки после подтверждения возраста
                if (currentPage === 'catalog' || !currentPage) {
                    displayProducts();
                }
                
                // Если мы на странице корзины, обновляем корзину плавно
                // Используем requestAnimationFrame для плавного обновления
                if (currentPage === 'cart') {
                    // Сначала обновляем переменную из localStorage
                    selectedPickupLocation = fullLocation;
                    // Используем requestAnimationFrame для плавного обновления без дерганья
                    requestAnimationFrame(() => {
                        updateCartItemsDisplay();
                    });
                }
                
                // Плавно закрываем модальное окно
                modal.style.transition = 'opacity 0.3s ease';
                modal.style.opacity = '0';
                modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                modalContent.style.transform = 'scale(0.95)';
                modalContent.style.opacity = '0';
                setTimeout(() => {
                    modal.remove();
                    document.body.style.overflow = '';
                    
                    // Если мы на странице товара, обновляем карточку товара после закрытия модального окна
                    if (currentPage === 'product' && viewingProduct) {
                        const container = document.getElementById('page-content');
                        if (container) {
                            renderProductContent(container, viewingProduct, null, null);
                        }
                    }
                }, 300);
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            });
            locationsList.appendChild(locationItem);
        });
        
        modalContent.appendChild(locationsList);
        modal.appendChild(modalContent);
        
        // Сохраняем обработчик BackButton для восстановления
        let originalBackButtonHandler = null;
        if (tg && tg.BackButton) {
            originalBackButtonHandler = tg.BackButton.onClick;
            tg.BackButton.hide();
        }
        
        const closeModal = function() {
            // Восстанавливаем кнопку "Назад"
            if (tg && tg.BackButton && originalBackButtonHandler) {
                tg.BackButton.onClick(originalBackButtonHandler);
                // Показываем кнопку "Назад" если нужно
                if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                    tg.BackButton.show();
                }
            }
            
            // Плавное закрытие
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        };
        
        // Устанавливаем обработчик BackButton после создания closeModal
        if (tg && tg.BackButton) {
            tg.BackButton.onClick(function() {
                // Блокируем кнопку "Назад" - закрываем модальное окно
                closeModal();
            });
        }
        
        // Блокируем прокрутку страницы
        const preventScroll = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        modal.addEventListener('wheel', preventScroll, {passive: false});
        modal.addEventListener('touchmove', preventScroll, {passive: false});
        
        // Закрытие при клике на фон
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        }, true);
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Плавное появление модального окна
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
        });
    }
    
    // Вызываем показ выбора города сразу при вызове функции
    showCitySelection();
}

// Выбор локации (старая функция, оставлена для совместимости, но не используется в навигации)
function selectLocation() {
    console.log('selectLocation called');
    
    // Структура локаций по городам
    const cities = {
        'Минск': [
            'ст. м. Грушевка',
            'ст. м. Площадь Победы',
            'ст. м. Немига',
            'ст. м. Октябрьская',
            'ст. м. Партизанская',
            'ст. м. Тракторный завод'
        ],
        'Могилёв': [
            'ул. Ленинская, 20',
            'пр-т Мира, 15',
            'ул. Первомайская, 8',
            'ул. Челюскинцев, 12'
        ]
    };
    
    // Удаляем предыдущее модальное окно если есть
    const existingModal = document.querySelector('.location-modal-overlay');
    if (existingModal) existingModal.remove();
    
    // Функция для создания элемента выбора
    function createSelectItem(text, isSelected, onClick) {
        const item = document.createElement('div');
        const borderColor = isSelected ? '#007AFF' : '#e5e5e5';
        const bgColor = isSelected ? '#f0f8ff' : '#ffffff';
        item.style.cssText = 'padding: 16px; border: 2px solid ' + borderColor + '; border-radius: 12px; background: ' + bgColor + '; cursor: pointer; display: flex; align-items: center; gap: 12px; touch-action: manipulation; word-wrap: break-word; overflow-wrap: break-word;';
        
        // Кружок слева
        const circle = document.createElement('div');
        const circleBorderColor = isSelected ? '#007AFF' : '#999';
        const circleBgColor = isSelected ? '#007AFF' : 'transparent';
        circle.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; border: 2px solid ' + circleBorderColor + '; background: ' + circleBgColor + '; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
        if (isSelected) {
            const innerCircle = document.createElement('div');
            innerCircle.style.cssText = 'width: 10px; height: 10px; border-radius: 50%; background: white;';
            circle.appendChild(innerCircle);
        }
        
        // Текст
        const textDiv = document.createElement('div');
        const textWeight = isSelected ? '600' : '500';
        const textColor = isSelected ? '#007AFF' : '#000';
        textDiv.style.cssText = 'font-size: 16px; font-weight: ' + textWeight + '; color: ' + textColor + '; flex: 1; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; min-width: 0;';
        textDiv.textContent = text;
        
        item.appendChild(circle);
        item.appendChild(textDiv);
        
        // Обработчик клика
        const handleSelect = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onClick();
        };
        
        item.addEventListener('click', handleSelect, true);
        item.addEventListener('touchend', handleSelect, {passive: false, capture: true});
        item.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        }, {passive: false});
        
        return item;
    }
    
    // Функция для показа списка городов
    function showCitySelection() {
        const modal = document.createElement('div');
        modal.className = 'location-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'location-modal-content';
        modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
        
        // Заголовок
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 20px;';
        header.innerHTML = '<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">📍 Выберите город</div><div style="font-size: 14px; color: #666;">Выберите город для самовывоза</div>';
        modalContent.appendChild(header);
        
        // Список городов
        const citiesList = document.createElement('div');
        citiesList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
        
        Object.keys(cities).forEach((cityName) => {
            const cityItem = createSelectItem(cityName, false, function() {
                // При выборе города показываем точки этого города
                showLocationsForCity(cityName, cities[cityName], modal);
            });
            citiesList.appendChild(cityItem);
        });
        
        modalContent.appendChild(citiesList);
        modal.appendChild(modalContent);
        
        // Закрытие при клике на фон
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
                document.body.style.overflow = '';
            }
        }, true);
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        return modal;
    }
    
    // Функция для показа точек в выбранном городе
    function showLocationsForCity(cityName, locations, previousModal) {
        // Удаляем предыдущее модальное окно
        if (previousModal) previousModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'location-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'location-modal-content';
        modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
        
        // Заголовок с кнопкой назад
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 20px; display: flex; align-items: center; gap: 12px;';
        
        const backBtn = document.createElement('button');
        backBtn.textContent = '←';
        backBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
        backBtn.onclick = function() {
            // Плавное закрытие
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
            modal.remove();
            showCitySelection();
            }, 300);
        };
        
        const headerText = document.createElement('div');
        headerText.style.cssText = 'flex: 1;';
        headerText.innerHTML = '<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">📍 ' + cityName + '</div><div style="font-size: 14px; color: #666;">Выберите точку самовывоза</div>';
        
        header.appendChild(backBtn);
        header.appendChild(headerText);
        modalContent.appendChild(header);
        
        // Список точек
        const locationsList = document.createElement('div');
        locationsList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
        
        locations.forEach((locationName) => {
            const fullLocation = cityName + ', ' + locationName;
            const isSelected = fullLocation === currentLocation;
            const locationItem = createSelectItem(locationName, isSelected, function() {
                // Обновляем выбранную локацию
                currentLocation = fullLocation;
                const locEl = document.getElementById('current-location');
                if (locEl) {
                    locEl.textContent = currentLocation;
                }
                
                // Плавно закрываем модальное окно
                modal.style.transition = 'opacity 0.3s ease';
                modal.style.opacity = '0';
                modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                modalContent.style.transform = 'scale(0.95)';
                modalContent.style.opacity = '0';
                setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
                }, 300);
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            });
            locationsList.appendChild(locationItem);
        });
        
        modalContent.appendChild(locationsList);
        modal.appendChild(modalContent);
        
        // Закрытие при клике на фон
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                // Плавное закрытие
                modal.style.transition = 'opacity 0.3s ease';
                modal.style.opacity = '0';
                modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                modalContent.style.transform = 'scale(0.95)';
                modalContent.style.opacity = '0';
                setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
                }, 300);
            }
        }, true);
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Плавное появление модального окна
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
        });
        
        // Восстанавливаем прокрутку при закрытии
        const observer = new MutationObserver(function() {
            if (!document.querySelector('.location-modal-overlay')) {
                document.body.style.overflow = '';
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    // Показываем выбор города
    showCitySelection();
}

// Генерация слотов времени доставки/самовывоза (сегодня и завтра, с 9:00 до 23:00-00:00)
function generateTimeSlots() {
    const slots = [];
    // Используем московское время для определения сегодня/завтра
    const moscowTime = getMoscowTime();
    const today = new Date(Date.UTC(moscowTime.getUTCFullYear(), moscowTime.getUTCMonth(), moscowTime.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    
    const currentHour = moscowTime.getUTCHours();
    const currentMinute = moscowTime.getUTCMinutes();
    
    // Определяем выбранный день в формате YYYY-MM-DD (московское время)
    const todayKey = getMoscowDateString();
    const tomorrowKey = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
    const targetDay = selectedDeliveryDay || todayKey;
    
    // Вкладки дней
    const days = [
        { date: today, key: todayKey, label: 'Сегодня' },
        { date: tomorrow, key: tomorrowKey, label: 'Завтра' }
    ];
    
    // Добавляем вкладки дней и время под ними
    slots.push(`
        <div style="margin-bottom: 20px;">
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                ${days.map(day => {
                    const isSelected = selectedDeliveryDay === day.key || (!selectedDeliveryDay && day.key === todayKey);
                    return `
                        <button onclick="selectDeliveryDay('${day.key}')" 
                            style="padding: 8px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; 
                            border-radius: 12px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; 
                            cursor: pointer; font-size: 14px; font-weight: 600; 
                            color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s;
                            white-space: nowrap;">
                            ${day.label}
                        </button>
                    `;
                }).join('')}
            </div>
    `);
    
    // Не показываем выбор точного времени здесь - это будет в отдельном модальном окне
    if (false && deliveryTime && deliveryTime.includes('|')) {
        const [dateKey, timeRange] = deliveryTime.split('|');
        const [startTime, endTime] = timeRange.split('-');
        const [startHour, startMin] = startTime.split(':');
        const [endHour, endMin] = endTime.split(':');
        
        // Генерируем точные времена: каждые 15 минут
        const exactTimes = [];
        let currentTime = new Date();
        currentTime.setHours(parseInt(startHour), parseInt(startMin), 0, 0);
        const endTimeObj = new Date();
        endTimeObj.setHours(parseInt(endHour), parseInt(endMin || 0), 0, 0);
        
        while (currentTime <= endTimeObj) {
            const hours = currentTime.getHours();
            const minutes = currentTime.getMinutes();
            const timeStr = `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
            const isSelected = deliveryExactTime === timeStr;
            exactTimes.push(`
                <button onclick="setDeliveryExactTime('${timeStr}')" 
                    style="padding: 10px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; 
                    border-radius: 10px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; 
                    cursor: pointer; font-size: 14px; font-weight: 600; 
                    color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s;
                    white-space: nowrap; margin-right: 8px; margin-bottom: 8px;">
                    ${timeStr}
                </button>
            `);
            currentTime.setMinutes(currentTime.getMinutes() + 15);
        }
        
        slots.push(`
            <div style="margin-bottom: 16px;">
                <div style="font-weight: 600; font-size: 14px; color: #666; margin-bottom: 12px;">
                    Выберите точное время (${timeRange})
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${exactTimes.join('')}
                </div>
            </div>
        `);
    }
    
    // Показываем промежутки времени для выбранного дня ПОД вкладками
    const isToday = targetDay === todayKey;
    const timeSlots = [];
    
    // Функция для проверки, все ли времена в промежутке заняты (только для самовывоза)
    // Используем синхронную проверку локальных заказов, серверные заказы проверяются асинхронно
    const isTimeSlotFullyBooked = (startHour, endHour) => {
        if (deliveryType !== 'selfPickup') return false; // Для доставки не проверяем
        
        const bookedTimes = getBookedTimesForDate(targetDay, selectedPickupLocation);
        if (bookedTimes.length === 0) return false;
        
        // Генерируем все возможные времена в промежутке (каждые 10 минут)
        const allTimesInSlot = [];
        let currentHour = parseInt(startHour);
        let currentMin = 0;
        const endHourInt = parseInt(endHour);
        
        while (currentHour < endHourInt || (currentHour === endHourInt && currentMin === 0)) {
            const timeStr = `${currentHour < 10 ? '0' : ''}${currentHour}:${currentMin < 10 ? '0' : ''}${currentMin}`;
            allTimesInSlot.push(timeStr);
            
            currentMin += 10;
            if (currentMin >= 60) {
                currentMin = 0;
                currentHour++;
            }
            
            if (currentHour >= endHourInt) break;
        }
        
        // Проверяем, все ли времена заняты
        return allTimesInSlot.length > 0 && allTimesInSlot.every(time => bookedTimes.includes(time));
    };
    
    // Асинхронно проверяем заказы с сервера и обновляем UI
    // Только для самовывоза проверяем занятость времени
    if (deliveryType === 'selfPickup' && selectedPickupLocation) {
        const currentPickupLocation = encodeURIComponent(selectedPickupLocation);
        fetch(`${SERVER_URL}/api/orders/booked-times?date=${targetDay}&location=${currentPickupLocation}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && Array.isArray(data.bookedTimes)) {
                    const serverBookedTimes = data.bookedTimes;
                    const localBookedTimes = getBookedTimesForDate(targetDay, selectedPickupLocation);
                    const allBookedTimes = [...new Set([...localBookedTimes, ...serverBookedTimes])];
                
                // Обновляем кнопки временных промежутков
                const timeSlotButtons = document.querySelectorAll('#time-slots-modal-container button');
                timeSlotButtons.forEach(btn => {
                    const timeText = btn.textContent.trim();
                    if (timeText.includes('-')) {
                        const [startTime, endTime] = timeText.split('-');
                        const [startHour, startMin] = startTime.split(':');
                        const [endHour, endMin] = endTime.split(':');
                        
                        // Генерируем все времена в промежутке
                        const allTimesInSlot = [];
                        let currentHour = parseInt(startHour);
                        let currentMin = parseInt(startMin || 0);
                        const endHourInt = parseInt(endHour);
                        const endMinInt = parseInt(endMin || 0);
                        
                        while (currentHour < endHourInt || (currentHour === endHourInt && currentMin < endMinInt)) {
                            const timeStr = `${currentHour < 10 ? '0' : ''}${currentHour}:${currentMin < 10 ? '0' : ''}${currentMin}`;
                            allTimesInSlot.push(timeStr);
                            
                            currentMin += 10;
                            if (currentMin >= 60) {
                                currentMin = 0;
                                currentHour++;
                            }
                            
                            if (currentHour > endHourInt || (currentHour === endHourInt && currentMin >= endMinInt)) break;
                        }
                        
                        // Проверяем, все ли времена заняты
                        const isFullyBooked = allTimesInSlot.length > 0 && allTimesInSlot.every(time => allBookedTimes.includes(time));
                        
                        if (isFullyBooked && !btn.disabled) {
                            btn.disabled = true;
                            btn.style.cssText = 'padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;';
                            btn.removeAttribute('onclick');
                        }
                    }
                });
            }
            })
            .catch(error => {
                console.error('Error fetching booked times:', error);
            });
    }
    
    // Генерируем слоты с 9:00 до 23:00-00:00 (каждый час)
    for (let hour = 9; hour < 23; hour++) {
        const startHour = hour < 10 ? `0${hour}` : `${hour}`;
        const endHour = hour + 1 < 10 ? `0${hour + 1}` : `${hour + 1}`;
        const timeSlot = `${targetDay}|${startHour}:00-${endHour}:00`;
        
        // Проверяем, не прошло ли время
        // Если сейчас 19:41, то должны быть доступны 19:40, 19:50 и диапазон 19-20
        if (isToday) {
            // Для текущего часа показываем диапазон, если еще не прошло 50 минут
            if (hour === currentHour) {
                if (currentMinute >= 50) {
                    continue; // Если уже 50+ минут, пропускаем этот час
                }
                // Иначе показываем диапазон (19:00-20:00 если сейчас 19:41)
            } else if (hour < currentHour) {
                continue; // Пропускаем прошедшие часы
            }
        }
        
        // Проверяем, все ли времена в промежутке заняты (только для самовывоза)
        const isFullyBooked = isTimeSlotFullyBooked(startHour, endHour);
        
        const isSelected = deliveryTime === timeSlot || deliveryTime === `${startHour}:00-${endHour}:00`;
        const buttonStyle = isFullyBooked
            ? `padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;`
            : `padding: 10px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; border-radius: 10px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; cursor: pointer; font-size: 14px; font-weight: 600; color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px;`;
        
        timeSlots.push(`
            <button ${isFullyBooked ? 'disabled' : `onclick="setDeliveryTime('${timeSlot}')"`}
                style="${buttonStyle}">
                ${startHour}:00-${endHour}:00
            </button>
        `);
    }
    
    // Добавляем последний слот 23:00-00:00
    if (!isToday || (currentHour < 23 || currentMinute < 59)) {
        const lastSlot = `${targetDay}|23:00-00:00`;
        const isSelected = deliveryTime === lastSlot || deliveryTime === '23:00-00:00';
        
        // Проверяем, все ли времена в промежутке 23:00-00:00 заняты (только для самовывоза)
        const isFullyBooked = (() => {
            if (deliveryType !== 'selfPickup') return false;
            const bookedTimes = getBookedTimesForDate(targetDay);
            if (bookedTimes.length === 0) return false;
            const allTimesInSlot = ['23:00', '23:10', '23:20', '23:30', '23:40', '23:50'];
            return allTimesInSlot.length > 0 && allTimesInSlot.every(time => bookedTimes.includes(time));
        })();
        
        const buttonStyle = isFullyBooked
            ? `padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;`
            : `padding: 10px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; border-radius: 10px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; cursor: pointer; font-size: 14px; font-weight: 600; color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px;`;
        
        timeSlots.push(`
            <button ${isFullyBooked ? 'disabled' : `onclick="setDeliveryTime('${lastSlot}')"`}
                style="${buttonStyle}">
                23:00-00:00
            </button>
        `);
    }
    
    // Добавляем время под вкладками
    slots.push(`
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${timeSlots.join('')}
            </div>
        </div>
    `);
    
    return slots.join('');
}

// Выбрать день доставки
function selectDeliveryDay(dayKey) {
    selectedDeliveryDay = dayKey;
    localStorage.setItem('selectedDeliveryDay', selectedDeliveryDay);
    // Сбрасываем выбранное время при смене дня
    deliveryTime = null;
    deliveryExactTime = null;
    localStorage.removeItem('deliveryTime');
    localStorage.removeItem('deliveryExactTime');
    // Обновляем модальное окно
    const container = document.getElementById('time-slots-modal-container');
    if (container) {
        container.innerHTML = generateTimeSlots();
    }
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Установить точное время доставки
function setDeliveryExactTime(time) {
    deliveryExactTime = time;
    localStorage.setItem('deliveryExactTime', deliveryExactTime);
    
    // Обновляем визуально выбранный слот точного времени
    const container = document.getElementById('exact-time-slots-container');
    if (container) {
        container.querySelectorAll('button').forEach(btn => {
            const btnOnclick = btn.getAttribute('onclick');
            if (btnOnclick && btnOnclick.includes(`setDeliveryExactTime('${time}')`)) {
                btn.style.border = '2px solid #007AFF';
                btn.style.background = '#e3f2fd';
                btn.style.color = '#007AFF';
            } else if (btnOnclick && btnOnclick.includes('setDeliveryExactTime')) {
                btn.style.border = '2px solid #e5e5e5';
                btn.style.background = '#ffffff';
                btn.style.color = '#666';
            }
        });
    }
    
    // Обновляем отображение времени в корзине
    if (currentPage === 'cart') {
        const timeDisplay = document.getElementById('selected-delivery-time-display');
        const timeDisplayDelivery = document.getElementById('selected-delivery-time-display-delivery');
        const timeText = deliveryTime ? (deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime) : '';
        const exactText = time ? ` (${time})` : '';
        
        if (timeDisplay) {
            timeDisplay.textContent = timeText + exactText;
        }
        if (timeDisplayDelivery) {
            timeDisplayDelivery.textContent = timeText + exactText;
        }
    }
    
    // Закрываем модальное окно после выбора точного времени с плавной анимацией
    setTimeout(() => {
        const modal = document.querySelector('.exact-time-modal-overlay');
        if (modal) {
            const modalContent = modal.querySelector('.exact-time-modal-content');
            // Плавное закрытие
            modal.style.transition = 'opacity 0.2s ease';
            modal.style.opacity = '0';
            if (modalContent) {
                modalContent.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                modalContent.style.transform = 'scale(0.95)';
                modalContent.style.opacity = '0';
            }
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 200);
        }
        
        // Обновляем отображение времени в корзине
        let timeText = '';
        if (selectedDeliveryDay) {
            const deliveryDate = new Date(selectedDeliveryDay + 'T12:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const deliveryDateOnly = new Date(deliveryDate);
            deliveryDateOnly.setHours(0, 0, 0, 0);
            // Всегда показываем дату, а не слово "завтра"
            const dateText = deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            timeText = dateText;
        }
        if (deliveryTime) {
            const timePart = deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime;
            timeText += timeText ? `, ${timePart}` : timePart;
        }
        if (deliveryExactTime) {
            timeText += ` (${deliveryExactTime})`;
        }
        const timeDisplay = document.getElementById('selected-delivery-time-display');
        if (timeDisplay) {
            timeDisplay.textContent = timeText || 'Выбрать время';
        }
        const timeDisplayDelivery = document.getElementById('selected-delivery-time-display-delivery');
        if (timeDisplayDelivery) {
            timeDisplayDelivery.textContent = timeText || 'Выбрать время';
        }
    }, 300);
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Выбрать город для доставки
function selectCityForDelivery() {
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    const modal = document.createElement('div');
    modal.className = 'location-modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'location-modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        // Плавное закрытие
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 20px;';
    header.innerHTML = '<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">📍 Выберите город</div><div style="font-size: 14px; color: #666;">Выберите город для доставки</div>';
    modalContent.appendChild(header);
    
    const citiesList = document.createElement('div');
    citiesList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    
    // Список городов для доставки
    const deliveryCities = ['Минск', 'Могилев'];
    
    deliveryCities.forEach((cityName) => {
        const cityItem = document.createElement('button');
        cityItem.textContent = cityName;
        cityItem.style.cssText = 'padding: 14px 20px; border: 2px solid #e5e5e5; border-radius: 12px; background: #ffffff; cursor: pointer; font-size: 16px; font-weight: 600; color: #000; text-align: left; transition: all 0.3s;';
        cityItem.onmouseover = function() {
            this.style.borderColor = '#007AFF';
            this.style.background = '#f0f7ff';
        };
        cityItem.onmouseout = function() {
            this.style.borderColor = '#e5e5e5';
            this.style.background = '#ffffff';
        };
        cityItem.onclick = function() {
            selectedCity = cityName;
            localStorage.setItem('selectedCity', selectedCity);
            closeModal();
            showCart();
            // Обновляем отображение товаров в корзине после смены города
            setTimeout(() => {
                updateCartItemsDisplay();
            }, 100);
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        };
        citiesList.appendChild(cityItem);
    });
    
    modalContent.appendChild(citiesList);
    modal.appendChild(modalContent);
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Установить тип доставки
function setDeliveryType(type) {
    deliveryType = type;
    localStorage.setItem('deliveryType', deliveryType);
    
    // При смене типа доставки сбрасываем время, так как адрес может измениться
    deliveryTime = null;
    localStorage.removeItem('deliveryTime');
    
    // При смене типа доставки инициализируем значения по умолчанию
    if (type === 'selfPickup') {
        // Для самовывоза используем сохраненную точку или дефолтную
        if (!selectedPickupLocation) {
            selectedPickupLocation = 'Минск, ст. м. Грушевка';
            localStorage.setItem('selectedPickupLocation', selectedPickupLocation);
        }
    } else {
        // Для доставки используем сохраненный адрес или оставляем пустым
        if (!deliveryAddress) {
            deliveryAddress = '';
            localStorage.setItem('deliveryAddress', deliveryAddress);
        }
    }
    
    // Используем requestAnimationFrame для плавной перерисовки
    requestAnimationFrame(() => {
        showCart();
        // Обновляем отображение товаров в корзине после смены типа доставки
        setTimeout(() => {
            updateCartItemsDisplay();
        }, 100);
    });
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Выбор адреса на карте через Telegram
function selectLocationFromMap() {
    if (!tg) {
        showToast('Выбор на карте доступен только в Telegram', 'info', 3000);
        return;
    }
    
    // Используем requestLocation для получения текущего местоположения
    if (tg.requestLocation) {
        tg.requestLocation({
            callback: function(location) {
                if (location && location.latitude && location.longitude) {
                    // Формируем адрес из координат
                    deliveryAddress = `Координаты: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
                    if (location.address) {
                        deliveryAddress = location.address;
                    }
                    localStorage.setItem('deliveryAddress', deliveryAddress);
                    
                    // Обновляем поле ввода
                    const addressInput = document.getElementById('delivery-address-input');
                    if (addressInput) {
                        addressInput.value = deliveryAddress;
                        addressInput.style.border = '2px solid #e5e5e5';
                        addressInput.style.boxShadow = '';
                        // Теряем фокус, чтобы показать блок времени
                        addressInput.blur();
                    }
                    
                    // Обновляем корзину для показа времени
                    setTimeout(() => {
                        showCart();
                    }, 300);
                    
                    if (tg && tg.HapticFeedback) {
                        tg.HapticFeedback.notificationOccurred('success');
                    }
                }
            }
        });
    } else {
        showToast('Геолокация недоступна. Введите адрес вручную', 'info', 3000);
    }
}

// Функция для получения занятых времен для даты
function getBookedTimesForDate(dateKey, pickupLocation = null) {
    try {
        // Загружаем все заказы из localStorage
        const savedOrders = localStorage.getItem('orders');
        if (!savedOrders) return [];
        
        const allOrders = JSON.parse(savedOrders);
        if (!Array.isArray(allOrders)) return [];
        
        // Используем текущий выбранный адрес самовывоза если не передан
        const currentPickupLocation = pickupLocation || selectedPickupLocation || '';
        
        // Фильтруем заказы по дате, статусу и адресу самовывоза
        // Исключаем отмененные и отклоненные заказы - их время становится свободным
        // Учитываем только заказы на самовывоз с точным временем (для доставки точное время не используется)
        const bookedTimes = [];
        allOrders.forEach(order => {
            if (order.selectedDeliveryDay === dateKey && 
                order.deliveryExactTime && 
                (order.deliveryType === 'selfPickup' || !order.deliveryType) && // Только самовывоз
                (order.status === 'pending' || order.status === 'confirmed' || order.status === 'transferred') &&
                order.status !== 'cancelled' && order.status !== 'rejected') {
                
                // Проверяем адрес самовывоза - время занято только для конкретного адреса
                const orderPickupLocation = order.pickupLocation || order.location || '';
                if (currentPickupLocation && orderPickupLocation === currentPickupLocation) {
                    bookedTimes.push(order.deliveryExactTime);
                } else if (!currentPickupLocation && !orderPickupLocation) {
                    // Если адрес не указан в запросе и в заказе - считаем что это тот же адрес
                    bookedTimes.push(order.deliveryExactTime);
                }
            }
        });
        
        return bookedTimes;
    } catch (e) {
        console.error('Error in getBookedTimesForDate:', e);
        return [];
    }
}

// Показать модальное окно выбора точного времени
function showExactTimeSelectionModal(timeSlot) {
    console.log('showExactTimeSelectionModal called with:', timeSlot);
    
    // Проверяем формат timeSlot
    if (!timeSlot || !timeSlot.includes('|')) {
        console.error('Invalid timeSlot format:', timeSlot);
        showToast('Ошибка: неправильный формат времени', 'error', 3000);
        return;
    }
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    const [dateKey, timeRange] = timeSlot.split('|');
    const [startTime, endTime] = timeRange.split('-');
    const [startHour, startMin] = startTime.split(':');
    const [endHour, endMin] = endTime.split(':');
    
    // Удаляем предыдущее модальное окно если есть
    const existingModal = document.querySelector('.exact-time-modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'exact-time-modal-overlay';
    // ПРИНУДИТЕЛЬНО устанавливаем стили для немедленного отображения
    modal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; background: rgba(0,0,0,0.5) !important; z-index: 99999 !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 1 !important; visibility: visible !important;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'exact-time-modal-content';
    // ПРИНУДИТЕЛЬНО устанавливаем стили для немедленного отображения
    modalContent.style.cssText = 'background: white !important; padding: 24px !important; border-radius: 16px !important; max-width: 90% !important; width: 100% !important; max-width: 400px !important; max-height: 80vh !important; overflow-y: auto !important; position: relative !important; transform: scale(1) !important; opacity: 1 !important; visibility: visible !important;';
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        // Плавное закрытие
        modal.style.transition = 'opacity 0.2s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    };
    
    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 20px;';
    header.innerHTML = `<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#007AFF')}</span><span>Выберите точное время</span></div><div style="font-size: 14px; color: #666;">Промежуток: ${timeRange}</div>`;
    modalContent.appendChild(header);
    
    // Генерируем точные времена: каждые 10 минут
    const exactTimes = [];
    
    // Для случая 23:00-00:00 нужно обработать переход через полночь
    const isMidnightCross = parseInt(endHour) === 0 && parseInt(startHour) === 23;
    
    if (isMidnightCross) {
        // Для 23:00-00:00 генерируем времена от 23:00 до 00:00, НЕ включая 00:00
        // (последнее время промежутка не включается)
        const timeSlots = [
            '23:00', '23:10', '23:20', '23:30', '23:40', '23:50'
        ];
        
        // Получаем занятые времена для этой даты (локально)
        // Только для самовывоза проверяем занятость времени
        let bookedTimes = [];
        if (deliveryType === 'selfPickup') {
            bookedTimes = getBookedTimesForDate(dateKey, selectedPickupLocation);
        }
        
        timeSlots.forEach(timeStr => {
            const isSelected = deliveryExactTime === timeStr;
            const isBooked = deliveryType === 'selfPickup' && bookedTimes.includes(timeStr);
            const buttonStyle = isBooked 
                ? `padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;`
                : `padding: 10px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; border-radius: 10px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; cursor: pointer; font-size: 14px; font-weight: 600; color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px;`;
            
            exactTimes.push(`
                <button ${isBooked ? 'disabled' : `onclick="setDeliveryExactTime('${timeStr}')"`}
                    style="${buttonStyle}">
                    ${timeStr}
                </button>
            `);
        });
    } else {
        // Для обычных промежутков времени - используем фиксированный массив
        const timeSlots = [];
        let currentHour = parseInt(startHour);
        let currentMin = parseInt(startMin);
        const endHourInt = parseInt(endHour);
        const endMinInt = parseInt(endMin || 0);
        
        // Генерируем времена от начала до конца, НЕ включая конечное время
        // Например, для 15-16 генерируем: 15:00, 15:10, ..., 15:50 (БЕЗ 16:00)
        // Для 16-17 генерируем: 16:00, 16:10, ..., 16:50 (БЕЗ 17:00)
        // Если сейчас 19:41, то должны быть доступны 19:40, 19:50 и диапазон 19-20
        const moscowTime = getMoscowTime();
        const isTodayExact = dateKey === getMoscowDateString();
        const currentHourExact = moscowTime.getUTCHours();
        const currentMinuteExact = moscowTime.getUTCMinutes();
        
        while (true) {
            const timeStr = `${currentHour < 10 ? '0' : ''}${currentHour}:${currentMin < 10 ? '0' : ''}${currentMin}`;
            
            // Проверяем, не прошло ли это время (только для сегодня)
            if (isTodayExact && currentHour === currentHourExact) {
                // Если это текущий час, показываем только будущие времена (19:40, 19:50 если сейчас 19:41)
                if (currentMin <= currentMinuteExact) {
                    // Пропускаем прошедшие времена, но продолжаем цикл
                    currentMin += 10;
                    if (currentMin >= 60) {
                        currentMin = 0;
                        currentHour++;
                        if (currentHour >= 24) {
                            currentHour = 0;
                        }
                    }
                    continue;
                }
            } else if (isTodayExact && currentHour < currentHourExact) {
                // Пропускаем прошедшие часы
                currentMin += 10;
                if (currentMin >= 60) {
                    currentMin = 0;
                    currentHour++;
                    if (currentHour >= 24) {
                        currentHour = 0;
                    }
                }
                continue;
            }
            
            // Проверяем, не достигли ли мы конечного времени (если да, не добавляем и выходим)
            if (currentHour === endHourInt && currentMin === endMinInt) {
                break;
            }
            
            // Если прошли конечное время, выходим
            if (currentHour > endHourInt || (currentHour === endHourInt && currentMin > endMinInt)) {
                break;
            }
            
            // Добавляем текущее время в список
            timeSlots.push(timeStr);
            
            // Увеличиваем время на 10 минут
            currentMin += 10;
            if (currentMin >= 60) {
                currentMin = 0;
                currentHour++;
                if (currentHour >= 24) {
                    currentHour = 0;
                }
            }
            
            // Проверяем, не достигли ли мы конечного времени после увеличения
            if (currentHour === endHourInt && currentMin === endMinInt) {
                break;
            }
            
            // Защита от бесконечного цикла
            if (timeSlots.length > 144) { // Максимум 24 часа * 6 слотов в час
                break;
            }
        }
        
        // Получаем занятые времена для этой даты (локально)
        // Только для самовывоза проверяем занятость времени
        let bookedTimes = [];
        if (deliveryType === 'selfPickup') {
            bookedTimes = getBookedTimesForDate(dateKey, selectedPickupLocation);
        }
        
        timeSlots.forEach(timeStr => {
            const isSelected = deliveryExactTime === timeStr;
            const isBooked = deliveryType === 'selfPickup' && bookedTimes.includes(timeStr);
            const buttonStyle = isBooked 
                ? `padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;`
                : `padding: 10px 16px; border: 2px solid ${isSelected ? '#007AFF' : '#e5e5e5'}; border-radius: 10px; background: ${isSelected ? '#e3f2fd' : '#ffffff'}; cursor: pointer; font-size: 14px; font-weight: 600; color: ${isSelected ? '#007AFF' : '#666'}; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px;`;
            
            exactTimes.push(`
                <button ${isBooked ? 'disabled' : `onclick="setDeliveryExactTime('${timeStr}')"`}
                    style="${buttonStyle}">
                    ${timeStr}
                </button>
            `);
        });
    }
    
    // Контейнер для слотов времени
    const slotsContainer = document.createElement('div');
    slotsContainer.id = 'exact-time-slots-container';
    slotsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
    slotsContainer.innerHTML = exactTimes.join('');
    modalContent.appendChild(slotsContainer);
    
    modal.appendChild(modalContent);
    
    // Также проверяем заказы на сервере через API (асинхронно)
    // Это нужно для проверки заказов других пользователей
    // Только для самовывоза проверяем занятость времени
    if (deliveryType === 'selfPickup' && selectedPickupLocation) {
        const currentPickupLocation = encodeURIComponent(selectedPickupLocation);
        fetch(`${SERVER_URL}/api/orders/booked-times?date=${dateKey}&location=${currentPickupLocation}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && Array.isArray(data.bookedTimes)) {
                    // Объединяем с локальными заказами
                    const serverBookedTimes = data.bookedTimes;
                    const localBookedTimes = getBookedTimesForDate(dateKey, selectedPickupLocation);
                    const allBookedTimes = [...new Set([...localBookedTimes, ...serverBookedTimes])];
                    
                    // Обновляем модальное окно если оно открыто
                    const modal = document.querySelector('.exact-time-modal-overlay');
                    if (modal) {
                        const container = document.getElementById('exact-time-slots-container');
                        if (container) {
                            // Обновляем кнопки с обновленными данными
                            const timeSlots = container.querySelectorAll('button');
                            timeSlots.forEach(btn => {
                                const timeStr = btn.textContent.split(' ')[0].trim(); // Берем только время без "(занято)"
                                if (allBookedTimes.includes(timeStr) && !btn.disabled) {
                                    btn.disabled = true;
                                    btn.style.cssText = 'padding: 10px 16px; border: 2px solid #999; border-radius: 10px; background: #e0e0e0; cursor: not-allowed; font-size: 14px; font-weight: 600; color: #999; transition: all 0.3s; white-space: nowrap; margin-right: 8px; margin-bottom: 8px; opacity: 0.5;';
                                    btn.textContent = timeStr;
                                    btn.removeAttribute('onclick');
                                }
                            });
                        }
                    }
                }
            })
            .catch(err => {
                console.error('Error fetching booked times from server:', err);
            });
    }
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    // УБЕЖДАЕМСЯ что предыдущие модальные окна удалены
    document.querySelectorAll('.exact-time-modal-overlay, .time-selection-modal-overlay').forEach(m => m.remove());
    
    // Добавляем в DOM
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // ПРИНУДИТЕЛЬНО показываем модальное окно сразу - БЕЗ анимации
    // Используем !important для гарантии
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('z-index', '99999', 'important');
    modalContent.style.setProperty('transform', 'scale(1)', 'important');
    modalContent.style.setProperty('opacity', '1', 'important');
    modalContent.style.setProperty('visibility', 'visible', 'important');
    
    console.log('Exact time modal created and should be visible');
    
    // Дополнительно используем requestAnimationFrame для плавности
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.style.setProperty('opacity', '1', 'important');
            modal.style.setProperty('visibility', 'visible', 'important');
            modalContent.style.setProperty('transform', 'scale(1)', 'important');
            modalContent.style.setProperty('opacity', '1', 'important');
            modalContent.style.setProperty('visibility', 'visible', 'important');
            console.log('Exact time modal should be visible now (after RAF)');
        });
    });
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Показать модальное окно выбора времени
function showTimeSelectionModal() {
    // Проверяем, что адрес/точка выбрана
    if (deliveryType === 'selfPickup' && !selectedPickupLocation) {
        showToast('Сначала выберите точку самовывоза', 'warning', 2000);
        return;
    }
    if (deliveryType === 'delivery' && (!deliveryAddress || deliveryAddress.trim() === '')) {
        showToast('Сначала укажите адрес доставки', 'warning', 2000);
        return;
    }
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    // Удаляем предыдущее модальное окно если есть
    const existingModal = document.querySelector('.time-selection-modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'time-selection-modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'time-selection-modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        // Плавное закрытие
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 20px;';
    header.innerHTML = `<div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#007AFF')}</span><span>${deliveryType === 'selfPickup' ? 'Время самовывоза' : 'Время доставки'}</span></div><div style="font-size: 14px; color: #666;">Выберите удобное время</div>`;
    modalContent.appendChild(header);
    
    // Контейнер для слотов времени
    const slotsContainer = document.createElement('div');
    slotsContainer.id = 'time-slots-modal-container';
    slotsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
    slotsContainer.innerHTML = generateTimeSlots();
    modalContent.appendChild(slotsContainer);
    
    modal.appendChild(modalContent);
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Установить время доставки/самовывоза
function setDeliveryTime(time) {
    // Обрабатываем новый формат с датой (YYYY-MM-DD|HH:MM-HH:MM) или старый формат (HH:MM-HH:MM)
    let timeToStore = time;
    if (time.includes('|')) {
        // Новый формат с датой
        timeToStore = time;
        const [dateKey] = time.split('|');
        selectedDeliveryDay = dateKey;
        localStorage.setItem('selectedDeliveryDay', selectedDeliveryDay);
    } else {
        // Старый формат - преобразуем в новый с сегодняшней датой
        const today = new Date();
        const dateKey = today.toISOString().split('T')[0];
        timeToStore = `${dateKey}|${time}`;
        selectedDeliveryDay = dateKey;
        localStorage.setItem('selectedDeliveryDay', selectedDeliveryDay);
    }
    
    deliveryTime = timeToStore;
    localStorage.setItem('deliveryTime', deliveryTime);
    // Сбрасываем точное время при выборе нового промежутка
    deliveryExactTime = null;
    localStorage.removeItem('deliveryExactTime');
            
            // Обновляем отображение времени в корзине
    if (currentPage === 'cart') {
            const timeDisplay = document.getElementById('selected-delivery-time-display');
        const timeDisplayDelivery = document.getElementById('selected-delivery-time-display-delivery');
        const timeText = time.includes('|') ? time.split('|')[1] : time;
        
            if (timeDisplay) {
            timeDisplay.textContent = timeText;
            }
            if (timeDisplayDelivery) {
            timeDisplayDelivery.textContent = timeText;
        }
    }
    
    // Плавно закрываем текущее модальное окно
    const currentModal = document.querySelector('.time-selection-modal-overlay');
    if (currentModal) {
        // Добавляем плавную анимацию исчезновения
        currentModal.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        currentModal.style.opacity = '0';
        currentModal.style.transform = 'scale(0.95)';
        
        const modalContent = currentModal.querySelector('.time-selection-modal-content');
        if (modalContent) {
            modalContent.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
        }
        
        // После завершения анимации удаляем и открываем новое окно (только для самовывоза)
        setTimeout(() => {
            currentModal.remove();
            document.body.style.overflow = '';
            // Открываем модальное окно точного времени только для самовывоза
            if (deliveryType === 'selfPickup') {
                console.log('Opening exact time modal with:', timeToStore);
                setTimeout(() => {
            showExactTimeSelectionModal(timeToStore);
                }, 50);
                // Дублируем вызов для надежности
                setTimeout(() => {
                    const existing = document.querySelector('.exact-time-modal-overlay');
                    if (!existing) {
                        console.log('Modal not found, opening again');
                        showExactTimeSelectionModal(timeToStore);
                    }
        }, 200);
            }
        }, 300);
    } else {
        // Если нет текущего модального окна, открываем сразу (только для самовывоза)
        if (deliveryType === 'selfPickup') {
            console.log('Opening exact time modal with (no current modal):', timeToStore);
            setTimeout(() => {
        showExactTimeSelectionModal(timeToStore);
            }, 50);
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Показать корзину
function showCart() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    // Сохраняем позицию скролла перед обновлением
    const scrollPosition = container.scrollTop || 0;
    
    // Всегда загружаем актуальные данные корзины из localStorage перед отображением
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }
    
    // Всегда загружаем актуальный адрес из localStorage перед проверкой наличия
    const savedLocation = localStorage.getItem('selectedPickupLocation');
    if (savedLocation) {
        selectedPickupLocation = savedLocation;
    }
    
    const colors = getThemeColors();
    
    container.className = '';
    
    // Сбрасываем все возможные стили, которые могли остаться
    container.style.display = '';
    container.style.gridTemplateColumns = '';
    container.style.gap = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    container.style.transform = '';
    container.style.scale = '';
    container.style.width = '';
    container.style.height = '';
    container.style.left = '';
    container.style.top = '';
    container.style.right = '';
    container.style.bottom = '';
    
    // Сбрасываем прокрутку только при первом открытии корзины, не при обновлении
    // Проверяем, была ли корзина уже открыта (есть ли содержимое в контейнере)
    const wasCartOpen = container.innerHTML.trim() !== '' && container.querySelector('div[style*="border-radius: 16px"]');
    if (!wasCartOpen) {
        // Только при первом открытии корзины сбрасываем скролл
        window.scrollTo(0, 0);
        container.scrollTop = 0;
    }
    // При обновлении корзины сохраняем позицию скролла (уже сохранена выше в scrollPosition)
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: ${colors.textSecondary};">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">${getCartIcon('#999999')}</div>
                <h3 style="color: ${colors.text}; margin-bottom: 10px; font-size: 20px;">Корзина пуста</h3>
                <p style="color: ${colors.textSecondary};">Добавьте товары из каталога</p>
            </div>
        `;
        setTimeout(() => {
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        }, 10);
        return;
    }
    
    // Рассчитываем итоги
    // ВАЖНО: Суммируем количество товаров (не cart.length, а сумму всех item.quantity)
    const totalItemsCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    const totalMoney = cart.reduce((sum, item) => {
        if (item.paymentMethod === 'coins') return sum;
        return sum + (item.price * item.quantity);
    }, 0);
    
    const totalCoins = cart.reduce((sum, item) => {
        if (item.paymentMethod === 'money') return sum;
        // Всегда пересчитываем цену за коины заново по формуле price * 1 (пропорционально начислению)
        const coinsPrice = calculateVapeCoinsPrice(item.price, null);
        return sum + (coinsPrice * item.quantity);
    }, 0);
    
    // Загружаем сохраненный тип доставки и время
    const savedDeliveryType = localStorage.getItem('deliveryType');
    if (savedDeliveryType) {
        deliveryType = savedDeliveryType;
    }
    const savedDeliveryTime = localStorage.getItem('deliveryTime');
    if (savedDeliveryTime) {
        deliveryTime = savedDeliveryTime;
    }
    const savedDeliveryAddress = localStorage.getItem('deliveryAddress');
    if (savedDeliveryAddress) {
        deliveryAddress = savedDeliveryAddress;
    }
    // ВАЖНО: Всегда загружаем актуальный адрес из localStorage перед проверкой наличия
    const savedPickupLocation = localStorage.getItem('selectedPickupLocation');
    if (savedPickupLocation) {
        selectedPickupLocation = savedPickupLocation;
    }
    
    // Принудительно обновляем deliveryType из localStorage если нужно
    if (savedDeliveryType) {
        deliveryType = savedDeliveryType;
    }
    
    container.innerHTML = `
        <!-- Вкладки выбора типа доставки -->
        <div id="delivery-type-container" style="background: #ffffff; padding: 16px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: all 0.3s ease;">
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                <button onclick="setDeliveryType('selfPickup')" 
                    style="flex: 1; padding: 14px; border: 2px solid ${deliveryType === 'selfPickup' ? '#007AFF' : '#e5e5e5'}; 
                    border-radius: 12px; background: ${deliveryType === 'selfPickup' ? '#e3f2fd' : '#ffffff'}; 
                    cursor: pointer; font-size: 15px; font-weight: 600; 
                    color: ${deliveryType === 'selfPickup' ? '#007AFF' : '#666'}; transition: all 0.3s;
                    text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getLocationIcon(deliveryType === 'selfPickup' ? '#007AFF' : '#999')}</span>
                    <span>Точка самовывоза</span>
                </button>
                <button onclick="setDeliveryType('delivery')" 
                    style="flex: 1; padding: 14px; border: 2px solid ${deliveryType === 'delivery' ? '#007AFF' : '#e5e5e5'}; 
                    border-radius: 12px; background: ${deliveryType === 'delivery' ? '#e3f2fd' : '#ffffff'}; 
                    cursor: pointer; font-size: 15px; font-weight: 600; 
                    color: ${deliveryType === 'delivery' ? '#007AFF' : '#666'}; transition: all 0.3s;
                    text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getPackageIcon(deliveryType === 'delivery' ? '#007AFF' : '#999')}</span>
                    <span>Доставка</span>
                </button>
            </div>
            
            ${deliveryType === 'selfPickup' ? `
                <div style="background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); padding: 16px; border-radius: 12px; color: white; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: ${selectedPickupLocation ? '12px' : '0'};">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getLocationIcon('#ffffff')}</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px; opacity: 0.9;">Точка самовывоза</div>
                            <div style="font-size: 16px; font-weight: 700;" id="selected-pickup-location-display">${selectedPickupLocation}</div>
                </div>
                        <button onclick="selectPickupLocation()" style="padding: 8px 16px; border: 1px solid rgba(255,255,255,0.3); 
                    border-radius: 20px; background: rgba(255,255,255,0.2); cursor: pointer; font-size: 14px; color: white;
                    transition: all 0.2s;" 
                    onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                    onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                            Выбрать
                        </button>
                    </div>
                    ${selectedPickupLocation ? `
                    <div onclick="showTimeSelectionModal()" id="time-selection-pickup" style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.15); border-radius: 10px; cursor: pointer; transition: all 0.3s ease; border: 1px solid rgba(255,255,255,0.2);" 
                        onmouseover="this.style.background='rgba(255,255,255,0.25)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.15)'">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#ffffff')}</span>
                                <div>
                                    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 2px;">Время самовывоза</div>
                                    <div style="font-size: 16px; font-weight: 700;" id="selected-delivery-time-display">${(() => {
                                        if (!deliveryTime && !selectedDeliveryDay) return 'Выбрать время';
                                        let timeText = '';
                                        if (selectedDeliveryDay) {
                                            // Используем московское время для определения "Завтра"
                                            const today = getMoscowDateString();
                                            const [year, month, day] = today.split('-').map(Number);
                                            const todayDate = new Date(Date.UTC(year, month - 1, day));
                                            const tomorrowDate = new Date(todayDate);
                                            tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
                                            const tomorrowStr = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getUTCDate()).padStart(2, '0')}`;
                                            
                                            // Всегда показываем дату, а не слово "завтра"
                                            const dateText = new Date(selectedDeliveryDay + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                            timeText = dateText;
                                        }
                                        if (deliveryTime) {
                                            const timePart = deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime;
                                            timeText += timeText ? `, ${timePart}` : timePart;
                                        }
                                        if (deliveryExactTime) {
                                            timeText += ` (${deliveryExactTime})`;
                                        }
                                        return timeText || 'Выбрать время';
                                    })()}</div>
                                </div>
                            </div>
                            <span style="font-size: 18px;">›</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            ` : `
                <div style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); padding: 16px; border-radius: 12px; color: white; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#ffffff')}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px; opacity: 0.9;">Доставка курьером</div>
                            <div style="font-size: 13px; opacity: 0.9;">
                                Укажите адрес доставки ниже
                            </div>
                        </div>
                    </div>
                </div>
                ${!selectedCity ? `
                <div style="background: #ffffff; padding: 16px; border-radius: 12px; border: 2px solid #e5e5e5; transition: all 0.3s ease; margin-bottom: 12px;">
                    <div style="font-weight: 600; color: #000; font-size: 14px; margin-bottom: 12px;">
                        Город доставки
                    </div>
                    <button onclick="selectCityForDelivery()" style="width: 100%; padding: 14px; border: 2px solid #e5e5e5; 
                        border-radius: 10px; background: #ffffff; cursor: pointer; font-size: 15px; font-weight: 600; 
                        color: #666; transition: all 0.3s; text-align: left; display: flex; align-items: center; justify-content: space-between;"
                        onmouseover="this.style.borderColor='#007AFF'; this.style.background='#f0f7ff'"
                        onmouseout="this.style.borderColor='#e5e5e5'; this.style.background='#ffffff'">
                        <span>${selectedCity || 'Выберите город'}</span>
                        <span style="font-size: 18px;">›</span>
                    </button>
                </div>
                ` : `
                <div style="background: #ffffff; padding: 16px; border-radius: 12px; border: 2px solid #e5e5e5; transition: all 0.3s ease; margin-bottom: 12px;">
                    <div style="font-weight: 600; color: #000; font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span>Город доставки</span>
                        <button onclick="selectedCity = ''; localStorage.removeItem('selectedCity'); deliveryAddress = ''; localStorage.removeItem('deliveryAddress'); deliveryTime = null; localStorage.removeItem('deliveryTime'); showCart();" 
                            style="padding: 4px 8px; border: 1px solid #e5e5e5; border-radius: 6px; background: #f5f5f5; cursor: pointer; font-size: 12px; color: #666;">
                    Изменить
                </button>
            </div>
                    <div style="font-size: 16px; font-weight: 700; color: #007AFF;">${selectedCity}</div>
                </div>
                `}
                <div style="background: #ffffff; padding: 16px; border-radius: 12px; border: 2px solid #e5e5e5; transition: all 0.3s ease;">
                    <div style="font-weight: 600; color: #000; font-size: 14px; margin-bottom: 8px;">
                        Адрес доставки
                    </div>
                    <textarea id="delivery-address-input" placeholder="${selectedCity ? 'Введите адрес доставки (улица, дом, квартира)' : 'Сначала выберите город'}" 
                        ${!selectedCity ? 'disabled' : ''} 
                        style="width: 100%; max-width: 100%; min-height: 80px; padding: 12px; border: 2px solid #e5e5e5; border-radius: 10px; 
                        font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box; transition: all 0.3s ease;"
                        oninput="deliveryAddress = this.value; localStorage.setItem('deliveryAddress', deliveryAddress); 
                        this.style.border = '2px solid #e5e5e5'; this.style.boxShadow = '';
                        if (deliveryAddress.trim() === '') {
                            deliveryTime = null;
                            localStorage.removeItem('deliveryTime');
                            const timeDisplay = document.getElementById('selected-delivery-time-display-delivery');
                            if (timeDisplay) timeDisplay.textContent = 'Выбрать время';
                            const timeBlock = document.getElementById('time-selection-delivery');
                            if (timeBlock) {
                                timeBlock.style.display = 'none';
                            }
                        }"
                        onkeydown="if (event.key === 'Enter') { 
                            event.preventDefault(); 
                            if (this.value.trim() === '') {
                                this.blur(); 
                                if (window.tg && window.tg.close) { window.tg.close(); }
                            } else if (!event.shiftKey) {
                                this.blur(); 
                                if (window.tg && window.tg.close) { window.tg.close(); }
                            }
                        }"
                        onfocus="if (window.tg && window.tg.openKeyboard) { window.tg.openKeyboard(); }"
                        onblur="const addr = this.value.trim();
                        if (addr === '') {
                            deliveryTime = null;
                            localStorage.removeItem('deliveryTime');
                            const timeBlock = document.getElementById('time-selection-delivery');
                            if (timeBlock) timeBlock.style.display = 'none';
                        } else {
                            // Показываем блок времени только после потери фокуса и если адрес не пустой
                            setTimeout(() => {
                                const timeBlock = document.getElementById('time-selection-delivery');
                                if (!timeBlock) {
                                    showCart();
                                } else {
                                    timeBlock.style.display = 'block';
                                }
                            }, 100);
                        }
                        if (window.tg && window.tg.HapticFeedback) { window.tg.HapticFeedback.impactOccurred('light'); }">${deliveryAddress}</textarea>
                    <div id="close-keyboard-trigger" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: -1; display: none; pointer-events: none;"></div>
                    ${deliveryAddress && deliveryAddress.trim() !== '' ? `
                    <div onclick="showTimeSelectionModal()" id="time-selection-delivery" style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 10px; cursor: pointer; transition: all 0.3s ease; border: 2px solid #e5e5e5;" 
                        onmouseover="this.style.background='#eeeeee'; this.style.borderColor='#007AFF';"
                        onmouseout="this.style.background='#f5f5f5'; this.style.borderColor='#e5e5e5';">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#007AFF')}</span>
                                <div>
                                    <div style="font-size: 12px; color: #666; margin-bottom: 2px;">Время доставки</div>
                                    <div style="font-size: 16px; font-weight: 700; color: #000;" id="selected-delivery-time-display-delivery">${(() => {
                                        if (!deliveryTime && !selectedDeliveryDay) return 'Выбрать время';
                                        let timeText = '';
                                        if (selectedDeliveryDay) {
                                            // Используем московское время для определения "Завтра"
                                            const today = getMoscowDateString();
                                            const [year, month, day] = today.split('-').map(Number);
                                            const todayDate = new Date(Date.UTC(year, month - 1, day));
                                            const tomorrowDate = new Date(todayDate);
                                            tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
                                            const tomorrowStr = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getUTCDate()).padStart(2, '0')}`;
                                            
                                            // Всегда показываем дату, а не слово "завтра"
                                            const dateText = new Date(selectedDeliveryDay + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                            timeText = dateText;
                                        }
                                        if (deliveryTime) {
                                            const timePart = deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime;
                                            timeText += timeText ? `, ${timePart}` : timePart;
                                        }
                                        if (deliveryExactTime) {
                                            timeText += ` (${deliveryExactTime})`;
                                        }
                                        return timeText || 'Выбрать время';
                                    })()}</div>
                                </div>
                            </div>
                            <span style="font-size: 18px; color: #666;">›</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `}
        </div>
        
        
        ${cart.map((item, idx) => {
            // Всегда пересчитываем цену за коины заново по формуле price * 1 (пропорционально начислению)
            // Игнорируем сохраненное vapeCoinsPrice, чтобы всегда использовать актуальную формулу
            const coinsPrice = calculateVapeCoinsPrice(item.price, null);
            const canPayWithCoins = vapeCoins >= (coinsPrice * item.quantity) && coinsPrice > 0;
            const paymentMethod = item.paymentMethod || (canPayWithCoins ? 'coins' : 'money');
            const itemTotalMoney = paymentMethod === 'money' ? (item.price * item.quantity) : 0;
            const itemTotalCoins = paymentMethod === 'coins' ? (coinsPrice * item.quantity) : 0;
            
            // Проверяем наличие товара на выбранной точке
            // ВАЖНО: Используем актуальный selectedPickupLocation из переменной (уже обновлен из localStorage выше)
            const product = products.find(p => p.id === item.productId);
            let isItemInStock = true;
            if (product) {
                // Получаем актуальный адрес из переменной (уже обновлен из localStorage выше)
                const currentLocation = selectedPickupLocation || '';
                if (deliveryType === 'selfPickup' && currentLocation) {
                    // Проверяем наличие конкретного вкуса если он указан
                    if (item.flavor) {
                        isItemInStock = isFlavorInStockAtLocation(product, item.flavor, currentLocation);
                    } else {
                        isItemInStock = isProductInStockAtLocation(product, currentLocation);
                    }
                } else {
                    isItemInStock = product.inStock !== false && (product.quantity === undefined || product.quantity > 0);
                }
            }
            
            return `
            <div style="background: ${!isItemInStock ? '#f5f5f5' : '#ffffff'}; padding: 20px; border-radius: 16px; margin-bottom: 16px; 
                border: 2px solid ${!isItemInStock ? '#d0d0d0' : '#e5e5e5'}; box-shadow: 0 4px 12px rgba(0,0,0,0.08); ${!isItemInStock ? 'opacity: 0.8;' : ''}">
                <div style="display: flex; gap: 16px; position: relative; margin-bottom: 16px; align-items: flex-start;">
                    <div id="cart-item-image-${idx}" style="width: 100px; height: 100px; background: linear-gradient(135deg, #f8f8f8 0%, #f0f0f0 100%); 
                        border-radius: 12px; display: flex; align-items: center; justify-content: center; 
                        flex-shrink: 0; border: 3px solid #f0f0f0; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; position: relative; ${!isItemInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}">
                        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; border-radius: 12px; display: block; margin: 0; padding: 0; ${!isItemInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}" onerror="this.style.display='none'; this.parentElement.innerHTML='${getPackageIcon('#999999')}'">` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0;">${item.image || getPackageIcon('#999999')}</div>`}
                    </div>
                    <div style="flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word; ${!isItemInStock ? 'pointer-events: none;' : ''}">
                        <div style="font-weight: 700; font-size: 18px; margin-bottom: 8px; color: ${!isItemInStock ? '#999' : '#000'}; 
                            line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word;">${item.name}</div>
                        ${item.flavor ? `
                            <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); padding: 6px 12px; border-radius: 8px; 
                                display: inline-flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 13px; color: #d32f2f; font-weight: 600; border: 1px solid #ffcdd2; ${!isItemInStock ? 'opacity: 0.6;' : ''}">
                                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getCandyIcon('#d32f2f')}</span>
                                <span>${item.flavor}</span>
                            </div>
                        ` : ''}
                        ${item.strength ? `
                            <div style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 6px 12px; border-radius: 8px; 
                                display: inline-flex; align-items: center; gap: 4px; margin-left: ${item.flavor ? '8px' : '0'}; 
                                margin-bottom: 8px; font-size: 13px; color: #1976d2; font-weight: 600; border: 1px solid #90caf9; ${!isItemInStock ? 'opacity: 0.6;' : ''}">
                                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getLightningIcon('#1976d2')}</span>
                                <span>${item.strength}</span>
                            </div>
                        ` : ''}
                        ${!isItemInStock ? `
                            <div id="cart-item-stock-message-${idx}" style="margin-top: 8px; padding: 10px 14px; background: #fff3f3; border-radius: 8px; 
                                font-size: 14px; color: #f44336; font-weight: 700; border: 2px solid #ffcdd2; text-align: center;">
                                На данном адресе этого товара нет в наличии
                            </div>
                        ` : ''}
                    </div>
                    <button onclick="removeFromCart(${idx})" style="width: 36px; height: 36px; 
                        border: none; background: transparent; cursor: pointer; font-size: 24px; color: #999; 
                        border-radius: 50%; display: flex; align-items: center; justify-content: center;
                        transition: all 0.2s; flex-shrink: 0; position: absolute; top: -8px; right: -8px; z-index: 10;" 
                        onmouseover="this.style.color='#ff4444'; this.style.transform='scale(1.15)'"
                        onmouseout="this.style.color='#999'; this.style.transform='scale(1)'">
                        &times;
                    </button>
                </div>
                
                <div style="background: ${!isItemInStock ? '#e8e8e8' : '#f8f9fa'}; padding: 16px; border-radius: 12px; margin-bottom: 16px; ${!isItemInStock ? 'pointer-events: none; opacity: 0.6;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 600; color: #666; font-size: 14px;">Количество</div>
                        <div style="display: flex; align-items: center; gap: 12px; background: #ffffff; 
                            padding: 8px 16px; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                            <button onclick="changeQuantity(${idx}, -1)" style="width: 32px; height: 32px; 
                                border: none; border-radius: 8px; background: #f8f8f8; cursor: pointer; 
                                font-size: 18px; font-weight: 700; color: #666; transition: all 0.2s;" 
                                onmouseover="this.style.background='#e0e0e0'; this.style.transform='scale(1.1)'"
                                onmouseout="this.style.background='#f8f8f8'; this.style.transform='scale(1)'">-</button>
                            <span id="cart-item-quantity-${idx}" style="font-weight: 700; min-width: 40px; text-align: center; font-size: 18px; color: #000;">
                                ${item.quantity}
                            </span>
                            <button onclick="changeQuantity(${idx}, 1)" style="width: 32px; height: 32px; 
                                border: none; border-radius: 8px; background: #007AFF; cursor: pointer; 
                                font-size: 18px; font-weight: 700; color: white; transition: all 0.2s;" 
                                onmouseover="this.style.background='#0056b3'; this.style.transform='scale(1.1)'"
                                onmouseout="this.style.background='#007AFF'; this.style.transform='scale(1)'">+</button>
                        </div>
                    </div>
                    
                    ${canPayWithCoins || coinsPrice > 0 ? `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e5e5e5;">
                            <div style="font-weight: 600; color: #666; font-size: 14px; margin-bottom: 8px;">Способ оплаты</div>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="setPaymentMethod(${idx}, 'money')" 
                                    style="flex: 1; padding: 12px; border: 2px solid ${paymentMethod === 'money' ? '#007AFF' : '#e5e5e5'}; 
                                    border-radius: 10px; background: ${paymentMethod === 'money' ? '#e3f2fd' : '#ffffff'}; 
                                    cursor: pointer; font-size: 14px; font-weight: 600; 
                                    color: ${paymentMethod === 'money' ? '#007AFF' : '#666'}; transition: all 0.2s;
                                    text-align: center;">
                                    ${(item.price * item.quantity).toFixed(2)} BYN
                                </button>
                                <button onclick="setPaymentMethod(${idx}, 'coins')" 
                                    style="flex: 1; padding: 12px; border: 2px solid ${paymentMethod === 'coins' ? '#FF9800' : '#e5e5e5'}; 
                                    border-radius: 10px; background: ${paymentMethod === 'coins' ? '#fff3e0' : '#ffffff'}; 
                                    cursor: pointer; font-size: 14px; font-weight: 600; 
                                    color: ${paymentMethod === 'coins' ? '#FF9800' : '#666'}; transition: all 0.2s;
                                    ${!canPayWithCoins ? 'opacity: 0.5; cursor: not-allowed;' : ''}
                                    text-align: center;"
                                    ${!canPayWithCoins ? 'disabled' : ''}>
                                    ${(coinsPrice * item.quantity).toFixed(1)} коинов
                                </button>
                            </div>
                            ${!canPayWithCoins && coinsPrice > 0 && paymentMethod === 'coins' ? `
                                <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 8px; 
                                    font-size: 12px; color: #856404; text-align: center;">
                                    Недостаточно коинов (нужно ${(coinsPrice * item.quantity).toFixed(1)}, у вас ${vapeCoins.toFixed(1)})
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <div style="margin-top: 12px; padding: 12px; background: #e3f2fd; border-radius: 10px; text-align: center;">
                            <div style="font-weight: 600; color: #007AFF; font-size: 16px;">
                                ${(item.price * item.quantity).toFixed(2)} BYN
                            </div>
                        </div>
                    `}
                </div>
            </div>
            `;
        }).join('')}
        
        <div style="background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); padding: 24px; border-radius: 16px; margin-top: 16px; 
            border: 2px solid #e5e5e5; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e5e5;">
                <span style="color: #666; font-size: 14px;">Товары (${totalItemsCount} шт.)</span>
                <span style="font-weight: 600; font-size: 16px;">
                    ${totalMoney > 0 ? `${totalMoney.toFixed(2)} BYN` : ''}
                    ${totalCoins > 0 ? `${totalCoins.toFixed(1)} коинов` : ''}
                </span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 12px; margin-bottom: 20px;">
                <span style="font-weight: 700; font-size: 20px; color: #000;">Итого</span>
                <div style="text-align: right;">
                    ${totalMoney > 0 ? `<div style="font-weight: 700; font-size: 22px; color: #007AFF; margin-bottom: 4px;">
                        ${totalMoney.toFixed(2)} BYN
                    </div>` : ''}
                    ${totalCoins > 0 ? `<div style="font-weight: 700; font-size: 22px; color: #FF9800;">
                        ${totalCoins.toFixed(1)} коинов
                    </div>` : ''}
                </div>
            </div>
            <button onclick="checkout()" style="width: 100%; padding: 18px; background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); 
                color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: 700; 
                cursor: pointer; box-shadow: 0 4px 12px rgba(0,122,255,0.3); transition: all 0.2s;"
                onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(0,122,255,0.4)'"
                onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0,122,255,0.3)'">
                Оформить заказ
            </button>
        </div>
    `;
    
    // Добавляем обработчик закрытия клавиатуры при клике вне поля адреса
    setTimeout(() => {
        const addressInput = document.getElementById('delivery-address-input');
        const closeTrigger = document.getElementById('close-keyboard-trigger');
        if (addressInput && closeTrigger) {
            addressInput.addEventListener('focus', function() {
                closeTrigger.style.display = 'block';
                closeTrigger.style.zIndex = '9999';
                closeTrigger.style.pointerEvents = 'auto';
                closeTrigger.onclick = function(e) {
                    if (e.target === closeTrigger) {
                        addressInput.blur();
                        if (window.tg && window.tg.close) { 
                            try {
                                window.tg.close();
                            } catch(e) {}
                        }
                        closeTrigger.style.display = 'none';
                        closeTrigger.style.zIndex = '-1';
                        closeTrigger.style.pointerEvents = 'none';
                    }
                };
            });
            addressInput.addEventListener('blur', function() {
                setTimeout(function() {
                    closeTrigger.style.display = 'none';
                    closeTrigger.style.zIndex = '-1';
                    closeTrigger.style.pointerEvents = 'none';
                }, 100);
            });
        }
    }, 100);
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Изменить количество
function changeQuantity(index, change) {
    if (!cart[index]) return;
    
    // Если увеличиваем количество, проверяем ограничение на 9 товаров
    if (change > 0 && cart[index].quantity >= 9) {
        showToast('Максимальное количество товара одного вида: 9 шт.', 'error', 3000);
        return;
    }
    
    // Если уменьшаем количество и останется 0, и это последний товар в корзине - показываем подтверждение
    if (change < 0 && cart[index].quantity === 1 && cart.length === 1) {
        showRemoveLastItemConfirmation(index);
        return;
    }
    
    cart[index].quantity += change;
    
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    syncCartToServer(); // Синхронизируем с сервером
    updateCartBadge();
    
    // Сохраняем позицию скролла перед обновлением корзины
    const container = document.getElementById('page-content');
    const scrollPosition = container ? container.scrollTop : 0;
    
    // Обновляем только количество и итоги, не перерисовывая всю корзину
    // Это сохраняет состояние изображений (серые для отсутствующих товаров)
    const quantityElement = document.getElementById(`cart-item-quantity-${index}`);
    if (quantityElement) {
        quantityElement.textContent = cart[index].quantity;
    }
    
    // Обновляем итоги
    updateCartTotals();
    
    // Если товар удален, перерисовываем корзину
    if (cart[index] === undefined) {
        showCart();
    } else {
        // Восстанавливаем позицию скролла
    if (container && scrollPosition > 0) {
        setTimeout(() => {
            container.scrollTop = scrollPosition;
            }, 10);
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Подтверждение удаления последнего товара из корзины
function showRemoveLastItemConfirmation(index) {
    const item = cart[index];
    if (!item) return;
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    const product = products.find(p => p.id === item.productId);
    const productName = product ? product.name : 'товар';
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const closeModal = () => {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; background: #fff3e0; border-radius: 50%;">
                ${getInfoIcon('#FF9800').replace('width="24" height="24"', 'width="32" height="32"')}
            </div>
            <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #000;">Удалить товар?</div>
            <div style="font-size: 14px; color: #666; line-height: 1.5;">
                Вы собираетесь удалить последний товар из корзины.<br>
                <strong>${productName}</strong> будет удален.
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button id="cancel-remove-btn" style="flex: 1; padding: 14px; background: #f5f5f5; color: #666; border: 2px solid #e5e5e5; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                Отмена
            </button>
            <button id="confirm-remove-btn" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(244,67,54,0.3);">
                Удалить
            </button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Обработчики кнопок
    const cancelBtn = modalContent.querySelector('#cancel-remove-btn');
    const confirmBtn = modalContent.querySelector('#confirm-remove-btn');
    
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        cart.splice(index, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        syncCartToServer(); // Синхронизируем с сервером
        updateCartBadge();
        showCart();
        
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
    });
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Удалить из корзины
function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    syncCartToServer(); // Синхронизируем с сервером
    updateCartBadge();
    showCart();
}

// Установить способ оплаты для товара
function setPaymentMethod(index, method) {
    if (!cart[index]) return;
    
    const item = cart[index];
    // Всегда пересчитываем цену за коины заново по формуле price * 1
    const coinsPrice = calculateVapeCoinsPrice(item.price, null);
    const totalCoinsNeeded = coinsPrice * item.quantity;
    
    // Если пытаются оплатить коинами, проверяем баланс
    if (method === 'coins' && vapeCoins < totalCoinsNeeded) {
        showToast(`Недостаточно коинов\nНужно: ${totalCoinsNeeded.toFixed(1)}, у вас: ${vapeCoins.toFixed(1)}`, 'error', 3000);
        return;
    }
    
    cart[index].paymentMethod = method;
    localStorage.setItem('cart', JSON.stringify(cart));
    syncCartToServer(); // Синхронизируем с сервером
    
    // Находим кнопки способа оплаты для этого товара и обновляем их плавно
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
        // Находим все карточки товаров в корзине
        const cartItems = pageContent.querySelectorAll('[style*="background: #ffffff; padding: 20px"]');
        if (cartItems[index]) {
            const paymentButtons = cartItems[index].querySelectorAll('button[onclick*="setPaymentMethod"]');
            const coinsPrice = calculateVapeCoinsPrice(item.price, null);
            const canPayWithCoins = vapeCoins >= (coinsPrice * item.quantity) && coinsPrice > 0;
            
            // Обновляем кнопки способа оплаты
            paymentButtons.forEach((btn, btnIndex) => {
                const onclick = btn.getAttribute('onclick');
                const isMoneyBtn = onclick && onclick.includes("'money'");
                const isCoinsBtn = onclick && onclick.includes("'coins'");
                
                if (isMoneyBtn) {
                    // Кнопка BYN
                    btn.style.transition = 'all 0.3s ease';
                    btn.style.border = `2px solid ${method === 'money' ? '#007AFF' : '#e5e5e5'}`;
                    btn.style.background = method === 'money' ? '#e3f2fd' : '#ffffff';
                    btn.style.color = method === 'money' ? '#007AFF' : '#666';
                } else if (isCoinsBtn) {
                    // Кнопка коинов
                    btn.style.transition = 'all 0.3s ease';
                    btn.style.border = `2px solid ${method === 'coins' ? '#FF9800' : '#e5e5e5'}`;
                    btn.style.background = method === 'coins' ? '#fff3e0' : '#ffffff';
                    btn.style.color = method === 'coins' ? '#FF9800' : '#666';
                    if (!canPayWithCoins) {
                        btn.style.opacity = '0.5';
                        btn.disabled = true;
                    } else {
                        btn.style.opacity = '1';
                        btn.disabled = false;
                    }
                }
            });
            
            // Обновляем итоговую сумму
            updateCartTotals();
        }
    } else {
        // Если не нашли элементы, перерисовываем корзину
    showCart();
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обновление отображения товаров в корзине при смене адреса
function updateCartItemsDisplay() {
    if (currentPage !== 'cart') return;
    
    // Убеждаемся что selectedPickupLocation обновлен из localStorage
    const savedLocation = localStorage.getItem('selectedPickupLocation');
    if (savedLocation) {
        selectedPickupLocation = savedLocation;
    }
    
    // Убеждаемся что deliveryType обновлен из localStorage
    const savedDeliveryType = localStorage.getItem('deliveryType');
    if (savedDeliveryType) {
        deliveryType = savedDeliveryType;
    }
    
    const container = document.getElementById('page-content');
    if (!container) return;
    
    // Сохраняем позицию скролла перед обновлением
    const scrollPos = container.scrollTop || 0;
    
    // Обновляем только элементы товаров без полной перерисовки корзины
    // Это предотвращает дерганье
    requestAnimationFrame(() => {
        cart.forEach((item, idx) => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;
            
            // Проверяем наличие товара на новом адресе
            let isItemInStock = true;
            if (deliveryType === 'selfPickup' && selectedPickupLocation) {
                if (item.flavor) {
                    isItemInStock = isFlavorInStockAtLocation(product, item.flavor, selectedPickupLocation);
                } else {
                    isItemInStock = isProductInStockAtLocation(product, selectedPickupLocation);
                }
            } else {
                isItemInStock = product.inStock !== false && (product.quantity === undefined || product.quantity > 0);
            }
            
            // Обновляем стили карточки товара
            const cartItem = container.querySelector(`div[id^="cart-item-image-${idx}"]`)?.closest('div[style*="border-radius: 16px"]');
            if (cartItem) {
                // Плавно обновляем стили без перерисовки
                cartItem.style.transition = 'all 0.3s ease';
                cartItem.style.background = !isItemInStock ? '#f5f5f5' : '#ffffff';
                cartItem.style.borderColor = !isItemInStock ? '#d0d0d0' : '#e5e5e5';
                cartItem.style.opacity = !isItemInStock ? '0.8' : '1';
            }
            
            // Обновляем изображение товара
            const imageContainer = container.querySelector(`#cart-item-image-${idx}`);
            if (imageContainer) {
                imageContainer.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
                imageContainer.style.opacity = !isItemInStock ? '0.5' : '1';
                imageContainer.style.filter = !isItemInStock ? 'grayscale(100%)' : 'none';
                
                const img = imageContainer.querySelector('img');
                if (img) {
                    img.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
                    img.style.opacity = !isItemInStock ? '0.5' : '1';
                    img.style.filter = !isItemInStock ? 'grayscale(100%)' : 'none';
                }
            }
            
            // Обновляем сообщение о наличии
            const stockMessage = container.querySelector(`#cart-item-stock-message-${idx}`);
            if (!isItemInStock) {
                if (!stockMessage) {
                    // Создаем сообщение если его нет
                    const itemContainer = container.querySelector(`div[id^="cart-item-image-${idx}"]`)?.closest('div[style*="border-radius: 16px"]');
                    if (itemContainer) {
                        const infoDiv = itemContainer.querySelector('div[style*="flex: 1"]');
                        if (infoDiv) {
                            const messageDiv = document.createElement('div');
                            messageDiv.id = `cart-item-stock-message-${idx}`;
                            messageDiv.style.cssText = 'margin-top: 8px; padding: 10px 14px; background: #fff3f3; border-radius: 8px; font-size: 14px; color: #f44336; font-weight: 700; border: 2px solid #ffcdd2; text-align: center; transition: all 0.3s ease;';
                            messageDiv.textContent = 'На данном адресе этого товара нет в наличии';
                            infoDiv.appendChild(messageDiv);
                        }
                    }
                }
            } else {
                // Удаляем сообщение если товар в наличии
                if (stockMessage) {
                    stockMessage.style.transition = 'opacity 0.3s ease';
                    stockMessage.style.opacity = '0';
                    setTimeout(() => stockMessage.remove(), 300);
                }
            }
            
            // Обновляем стили блока количества
            const quantityBlock = container.querySelector(`div[id^="cart-item-quantity-${idx}"]`)?.closest('div[style*="background:"]');
            if (quantityBlock) {
                quantityBlock.style.transition = 'all 0.3s ease';
                quantityBlock.style.background = !isItemInStock ? '#e8e8e8' : '#f8f9fa';
                quantityBlock.style.opacity = !isItemInStock ? '0.6' : '1';
                quantityBlock.style.pointerEvents = !isItemInStock ? 'none' : 'auto';
            }
        });
        
        // Обновляем отображение точки самовывоза в корзине
        const locationDisplay = document.getElementById('selected-pickup-location-display');
        if (locationDisplay) {
            locationDisplay.textContent = selectedPickupLocation;
        }
        
        // Восстанавливаем позицию скролла
        requestAnimationFrame(() => {
            container.scrollTop = scrollPos;
        });
    });
}

// Обновление итоговой суммы корзины без полной перерисовки
function updateCartTotals() {
    const pageContent = document.getElementById('page-content');
    if (!pageContent || currentPage !== 'cart') return; // ВАЖНО: Обновляем только на странице корзины
    
    // Рассчитываем итоги
    const totalItemsCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalMoney = cart.reduce((sum, item) => {
        if (item.paymentMethod === 'coins') return sum;
        return sum + (item.price * (item.quantity || 1));
    }, 0);
    
    const totalCoins = cart.reduce((sum, item) => {
        if (item.paymentMethod === 'money') return sum;
        const coinsPrice = item.vapeCoinsPrice || calculateVapeCoinsPrice(item.price, null);
        return sum + (coinsPrice * (item.quantity || 1));
    }, 0);
    
    // ВАЖНО: Ищем элементы более точно, чтобы не удалить кнопку "Оформить заказ"
    // Ищем блок с итоговой суммой по более специфичному селектору
    const summarySection = pageContent.querySelector('div[style*="background: linear-gradient(135deg, #ffffff"]');
    if (summarySection) {
        // Обновляем количество товаров
        const itemsCountSpan = summarySection.querySelector('span:first-child');
        if (itemsCountSpan && itemsCountSpan.textContent.includes('Товары')) {
            itemsCountSpan.textContent = `Товары (${totalItemsCount} шт.)`;
        }
        
        // Обновляем сумму товаров
        const itemsSumSpan = itemsCountSpan?.nextElementSibling;
        if (itemsSumSpan) {
            let sumText = '';
            if (totalMoney > 0) {
                sumText += `${totalMoney.toFixed(2)} BYN`;
            }
            if (totalCoins > 0) {
                if (sumText) sumText += ' ';
                sumText += `${totalCoins.toFixed(1)} коинов`;
            }
            if (sumText) {
                itemsSumSpan.textContent = sumText;
            }
        }
        
        // Обновляем итоговую сумму
        const totalSection = summarySection.querySelector('div[style*="text-align: right"]');
        if (totalSection) {
            let html = '';
            if (totalMoney > 0) {
                html += `<div style="font-weight: 700; font-size: 22px; color: #007AFF; margin-bottom: 4px;">
                    ${totalMoney.toFixed(2)} BYN
                </div>`;
            }
            if (totalCoins > 0) {
                html += `<div style="font-weight: 700; font-size: 22px; color: #FF9800;">
                    ${totalCoins.toFixed(1)} коинов
                </div>`;
            }
            if (html) {
                totalSection.innerHTML = html;
            }
        }
        
        // ВАЖНО: Проверяем, что кнопка "Оформить заказ" существует
        const checkoutButton = summarySection.querySelector('button[onclick="checkout()"]');
        if (!checkoutButton) {
            // Если кнопка пропала, перерисовываем корзину полностью
            console.warn('⚠️ Кнопка "Оформить заказ" пропала, перерисовываем корзину');
            showCart();
            return;
        }
    } else {
        // Fallback: если не нашли summarySection, перерисовываем корзину
        console.warn('⚠️ Не найден блок итогов, перерисовываем корзину');
        showCart();
    }
}

// Оформить заказ
function checkout() {
    console.log('checkout called, cart length:', cart.length);
    
    if (cart.length === 0) {
        showToast('Корзина пуста', 'warning', 3000);
        return;
    }
    
    // Проверяем баланс коинов для товаров, оплачиваемых коинами
    let totalCoinsNeeded = 0;
    let totalMoney = 0;
    
    cart.forEach(item => {
        const paymentMethod = item.paymentMethod || 'money';
        // Всегда пересчитываем цену за коины заново по формуле price * 1 (пропорционально начислению)
        const coinsPrice = calculateVapeCoinsPrice(item.price, null);
        
        if (paymentMethod === 'coins') {
            totalCoinsNeeded += coinsPrice * item.quantity;
        } else {
            totalMoney += item.price * item.quantity;
        }
    });
    
    // Проверяем достаточность коинов только если есть товары, оплачиваемые коинами
    const hasCoinsPayment = cart.some(item => (item.paymentMethod || 'money') === 'coins');
    if (hasCoinsPayment && totalCoinsNeeded > 0 && vapeCoins < totalCoinsNeeded) {
        showToast(`Недостаточно коинов\nНужно: ${totalCoinsNeeded.toFixed(1)}, у вас: ${vapeCoins.toFixed(1)}`, 'error', 3000);
        return;
    }
    
    // Проверяем обязательные поля и показываем красную обводку
    let hasErrors = false;
    
    // Проверяем время
    if (!deliveryTime) {
        hasErrors = true;
        const timeDisplay = document.getElementById('selected-delivery-time-display');
        const timeDisplayDelivery = document.getElementById('selected-delivery-time-display-delivery');
        if (timeDisplay) {
            const timeBlock = timeDisplay.closest('div[onclick="showTimeSelectionModal()"]');
            if (timeBlock) {
                timeBlock.style.transition = 'all 0.3s ease';
                timeBlock.style.border = '2px solid #ff3b30';
                timeBlock.style.borderRadius = '10px';
                setTimeout(() => {
                    if (timeBlock) {
                        timeBlock.style.border = '1px solid rgba(255,255,255,0.2)';
                    }
                }, 3000);
            }
        }
        if (timeDisplayDelivery) {
            const timeBlockDelivery = timeDisplayDelivery.closest('div[onclick="showTimeSelectionModal()"]');
            if (timeBlockDelivery) {
                timeBlockDelivery.style.transition = 'all 0.3s ease';
                timeBlockDelivery.style.border = '2px solid #ff3b30';
                timeBlockDelivery.style.borderRadius = '10px';
                setTimeout(() => {
                    if (timeBlockDelivery) {
                        timeBlockDelivery.style.border = '2px solid #e5e5e5';
                    }
                }, 3000);
            }
        }
        showToast(`Пожалуйста, выберите ${deliveryType === 'selfPickup' ? 'время самовывоза' : 'время доставки'}`, 'error', 3000);
    }
    
    // Проверяем точное время (обязательно только для самовывоза)
    if (deliveryType === 'selfPickup' && !deliveryExactTime) {
        hasErrors = true;
        const timeDisplay = document.getElementById('selected-delivery-time-display');
        if (timeDisplay) {
            const timeBlock = timeDisplay.closest('div[onclick="showTimeSelectionModal()"]');
            if (timeBlock) {
                timeBlock.style.transition = 'all 0.3s ease';
                timeBlock.style.border = '2px solid #ff3b30';
                timeBlock.style.borderRadius = '10px';
                setTimeout(() => {
                    if (timeBlock) {
                        timeBlock.style.border = '1px solid rgba(255,255,255,0.2)';
                    }
                }, 3000);
            }
        }
        showToast('Пожалуйста, выберите точное время', 'error', 3000);
    }
    
    // Проверяем адрес/точку самовывоза
    if (deliveryType === 'selfPickup') {
        if (!selectedPickupLocation) {
            hasErrors = true;
            const pickupBlock = document.querySelector('[id*="pickup-location"]');
            if (pickupBlock) {
                const pickupContainer = pickupBlock.closest('div');
                if (pickupContainer) {
                    pickupContainer.style.transition = 'all 0.3s ease';
                    pickupContainer.style.border = '2px solid #ff3b30';
                    pickupContainer.style.borderRadius = '12px';
                    setTimeout(() => {
                        if (pickupContainer) {
                            pickupContainer.style.border = '2px solid rgba(255,255,255,0.3)';
                        }
                    }, 3000);
                }
            }
            showToast('Пожалуйста, выберите точку самовывоза', 'error', 3000);
        }
    } else {
        if (!deliveryAddress || deliveryAddress.trim() === '') {
            hasErrors = true;
            const addressInput = document.getElementById('delivery-address-input');
            if (addressInput) {
                addressInput.style.transition = 'all 0.3s ease';
                addressInput.style.border = '2px solid #ff3b30';
                addressInput.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.1)';
                setTimeout(() => {
                    if (addressInput) {
                        addressInput.style.border = '2px solid #e5e5e5';
                        addressInput.style.boxShadow = '';
                    }
                }, 3000);
            }
            showToast('Пожалуйста, укажите адрес доставки', 'error', 3000);
        }
    }
    
    if (hasErrors) {
        return;
    }
    
    // Проверяем наличие всех товаров в корзине на выбранной точке
    const unavailableItems = [];
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) {
            unavailableItems.push({ name: item.name || 'Неизвестный товар', reason: 'Товар не найден' });
            return;
        }
        
        let isInStock = false;
        if (item.flavor) {
            // Проверяем наличие конкретного вкуса
            isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? isFlavorInStockAtLocation(product, item.flavor, selectedPickupLocation)
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
        } else {
            // Проверяем общее наличие товара
            isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
                ? isProductInStockAtLocation(product, selectedPickupLocation)
                : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
        }
        
        if (!isInStock) {
            const itemName = item.flavor ? `${item.name}, ${item.flavor}` : item.name;
            const reason = 'На данном адресе этого товара нет';
            unavailableItems.push({ name: itemName, reason: reason });
        }
    });
    
    if (unavailableItems.length > 0) {
        const itemsList = unavailableItems.map(item => `• ${item.name}: ${item.reason}`).join('\n');
        const message = `Некоторые товары недоступны на данном адресе:\n${itemsList}`;
        showToast(message, 'error', 5000);
        return;
    }
    
    let orderText = 'Заказ:\n\n';
    
    cart.forEach(item => {
        const paymentMethod = item.paymentMethod || 'money';
        // Всегда пересчитываем цену за коины заново по формуле price * 1 (пропорционально начислению)
        const coinsPrice = calculateVapeCoinsPrice(item.price, null);
        
        orderText += `${item.name}`;
        if (item.flavor) orderText += ` (${item.flavor})`;
        if (item.strength) orderText += ` ${item.strength}`;
        orderText += ` x${item.quantity}`;
        
        if (paymentMethod === 'coins') {
            orderText += ` = ${(coinsPrice * item.quantity).toFixed(1)} COIN\n`;
        } else {
            orderText += ` = ${(item.price * item.quantity).toFixed(2)} BYN\n`;
        }
    });
    
    // Добавляем информацию о типе доставки и времени
    if (deliveryType === 'selfPickup') {
        orderText += `\nLOCATION Точка самовывоза: ${selectedPickupLocation}`;
        
        // Определяем дату доставки с учетом московского времени - всегда показываем дату, а не слово "завтра"
        let dateText = '';
        if (selectedDeliveryDay) {
            const deliveryDate = new Date(selectedDeliveryDay + 'T12:00:00');
            dateText = deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        
        const timeDisplay = deliveryTime ? (deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime) : 'Не выбрано';
        const exactDisplay = deliveryExactTime ? ` (точное время: ${deliveryExactTime})` : '';
        orderText += `\nCLOCK ${dateText ? `Дата: ${dateText}, ` : ''}Время самовывоза: ${timeDisplay}${exactDisplay}`;
    } else {
        orderText += `\nPACKAGE Доставка курьером`;
        orderText += `\nLOCATION Адрес доставки: ${deliveryAddress}`;
        
        // Определяем дату доставки с учетом московского времени - всегда показываем дату, а не слово "завтра"
        let dateText = '';
        if (selectedDeliveryDay) {
            const deliveryDate = new Date(selectedDeliveryDay + 'T12:00:00');
            dateText = deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        
        const timeDisplay = deliveryTime ? (deliveryTime.includes('|') ? deliveryTime.split('|')[1] : deliveryTime) : 'Не выбрано';
        const exactDisplay = deliveryExactTime ? ` (точное время: ${deliveryExactTime})` : '';
        orderText += `\nCLOCK ${dateText ? `Дата: ${dateText}, ` : ''}Время доставки: ${timeDisplay}${exactDisplay}`;
    }
    
    if (totalMoney > 0 && totalCoinsNeeded > 0) {
        orderText += `\nИтого: ${totalMoney.toFixed(2)} BYN + ${totalCoinsNeeded.toFixed(1)} COIN`;
    } else if (totalMoney > 0) {
        orderText += `\nИтого: ${totalMoney.toFixed(2)} BYN`;
    } else if (totalCoinsNeeded > 0) {
        orderText += `\nИтого: ${totalCoinsNeeded.toFixed(1)} COIN`;
    }
    
    // Добавляем предупреждение о цене доставки
    if (deliveryType === 'delivery') {
        orderText += `\n\nINFO Обратите внимание: стоимость доставки будет рассчитана при подтверждении заказа и может отличаться от указанной суммы.`;
    }
    
    // Функция для завершения оформления заказа
    const completeOrder = async () => {
        console.log('completeOrder called');
        
        // Создаем заказ
        const orderId = `order_${Date.now()}`;
        
        // Списываем коины для товаров, оплаченных коинами
        if (totalCoinsNeeded > 0) {
            vapeCoins -= totalCoinsNeeded;
            localStorage.setItem('vapeCoins', vapeCoins.toString());
            
            // Синхронизируем с сервером
            await syncVapeCoinsToServer(-totalCoinsNeeded, `Заказ: ${cart.length} товар(ов)`);
            
            // Добавляем транзакцию в историю
            const transaction = {
                id: `vc_${Date.now()}`,
                date: new Date().toISOString(),
                type: 'spent',
                amount: -totalCoinsNeeded,
                description: `Заказ: ${cart.length} товар(ов)`,
                orderId: orderId
            };
            vapeCoinsHistory.unshift(transaction);
            localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
            
            // ВАЖНО: Синхронизируем историю транзакций с сервером
            if (window.userDataManager && window.userDataManager.updateUserData) {
                window.userDataManager.updateUserData({ transactions: vapeCoinsHistory }).catch(err => {
                    console.error('Ошибка синхронизации истории транзакций:', err);
                });
            }
        }
        // Определяем дату заказа: приоритет selectedDeliveryDay, иначе из deliveryTime, иначе московское время
        let orderDate;
        if (selectedDeliveryDay) {
            // Приоритет: selectedDeliveryDay (уже в формате YYYY-MM-DD)
            orderDate = new Date(selectedDeliveryDay + 'T12:00:00').toISOString();
        } else if (deliveryTime && deliveryTime.includes('|')) {
            // Если deliveryTime содержит дату (формат 'YYYY-MM-DD|HH:MM-HH:MM')
            const [dateStr] = deliveryTime.split('|');
            orderDate = new Date(dateStr + 'T12:00:00').toISOString();
        } else {
            // Иначе используем текущую дату в московском времени
            const moscowDate = getMoscowDateString();
            orderDate = new Date(moscowDate + 'T12:00:00').toISOString();
        }
        
        // Отправляем заказ на сервер
        const orderData = {
            items: [...cart],
            location: deliveryType === 'selfPickup' ? selectedPickupLocation : deliveryAddress,
            deliveryType: deliveryType,
            deliveryTime: deliveryTime,
            deliveryExactTime: deliveryExactTime,
            selectedDeliveryDay: selectedDeliveryDay,
            deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
            pickupLocation: deliveryType === 'selfPickup' ? selectedPickupLocation : null,
            total: totalMoney,
            vapeCoinsSpent: totalCoinsNeeded > 0 ? totalCoinsNeeded : 0,
            userId: tg?.initDataUnsafe?.user?.id?.toString() || 'unknown',
            userUsername: tg?.initDataUnsafe?.user?.username || null
        };
        
        let finalOrderId = orderId; // ID заказа для отображения
        
        try {
            // Отправляем заказ на сервер
            const response = await fetch(`${SERVER_URL}/api/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                finalOrderId = result.orderId;
                // Создаем локальный заказ со статусом 'pending'
                // Получаем актуальное московское время для времени создания заказа
                const moscowTimeNow = getMoscowTime();
                const createdAt = moscowTimeNow.toISOString();
                
                const order = {
                    id: result.orderId,
                    date: orderDate,
                    createdAt: createdAt, // Время создания заказа в московском времени
                    status: 'pending', // Ожидает подтверждения менеджером
                    items: [...cart],
                    location: deliveryType === 'selfPickup' ? selectedPickupLocation : deliveryAddress,
                    deliveryType: deliveryType,
                    deliveryTime: deliveryTime,
                    deliveryExactTime: deliveryExactTime,
                    selectedDeliveryDay: selectedDeliveryDay,
                    deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
                    pickupLocation: deliveryType === 'selfPickup' ? selectedPickupLocation : null,
                    total: totalMoney,
                    vapeCoinsSpent: totalCoinsNeeded > 0 ? totalCoinsNeeded : 0
                };
                
                // Сохраняем заказ локально
                orders.unshift(order);
                localStorage.setItem('orders', JSON.stringify(orders));
                
                // ВАЖНО: Сохраняем заказ в БД через userDataManager
                if (window.userDataManager && window.userDataManager.addOrder) {
                    try {
                        await window.userDataManager.addOrder({
                            id: result.orderId,
                            date: orderDate,
                            createdAt: createdAt,
                            status: 'pending',
                            items: [...cart],
                            location: deliveryType === 'selfPickup' ? selectedPickupLocation : deliveryAddress,
                            deliveryType: deliveryType,
                            deliveryTime: deliveryTime,
                            deliveryExactTime: deliveryExactTime,
                            selectedDeliveryDay: selectedDeliveryDay,
                            deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
                            pickupLocation: deliveryType === 'selfPickup' ? selectedPickupLocation : null,
                            total: totalMoney,
                            vapeCoinsSpent: totalCoinsNeeded > 0 ? totalCoinsNeeded : 0
                        });
                        console.log('✅ Заказ сохранен в БД через userDataManager');
                    } catch (error) {
                        console.error('Ошибка сохранения заказа в БД:', error);
                    }
                }
                
                // Показываем уведомление о перемещении в заказы
                showToast('Заказ оформлен!\nПеремещен в раздел "Мои заказы"', 'success', 4000);
                
                // Запускаем проверку статуса заказа
                checkOrderStatus(result.orderId);
                
                // НЕ переключаем на вкладку заказов автоматически
                // Обновляем отображение заказов только если пользователь уже на странице заказов
                if (currentPage === 'orders') {
                    setTimeout(() => {
                        showOrders();
                    }, 100);
                }
            } else {
                throw new Error(result.error || 'Ошибка при отправке заказа');
            }
        } catch (error) {
            console.error('Error sending order to server:', error);
            // Если сервер недоступен, сохраняем локально со статусом 'pending'
            const order = {
                id: orderId,
                date: orderDate,
                status: 'pending',
                items: [...cart],
                location: deliveryType === 'selfPickup' ? selectedPickupLocation : deliveryAddress,
                deliveryType: deliveryType,
                deliveryTime: deliveryTime,
                deliveryExactTime: deliveryExactTime,
                selectedDeliveryDay: selectedDeliveryDay,
                deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
                pickupLocation: deliveryType === 'selfPickup' ? selectedPickupLocation : null,
                total: totalMoney,
                vapeCoinsSpent: totalCoinsNeeded > 0 ? totalCoinsNeeded : 0
            };
            
            orders.unshift(order);
            localStorage.setItem('orders', JSON.stringify(orders));
            
            showToast('Заказ создан, но сервер недоступен. Статус будет обновлен позже.', 'warning', 4000);
        }
        
        // Очищаем корзину
        cart = [];
        localStorage.setItem('cart', JSON.stringify(cart));
        syncCartToServer(); // Синхронизируем с сервером
        updateCartBadge();
        
        // Сбрасываем время доставки/самовывоза для следующего заказа
        deliveryTime = null;
        deliveryExactTime = null;
        selectedDeliveryDay = null;
        localStorage.removeItem('deliveryTime');
        localStorage.removeItem('deliveryExactTime');
        localStorage.removeItem('selectedDeliveryDay');
        
        // Убеждаемся, что все модальные окна закрыты и стили восстановлены
        document.body.style.overflow = '';
        document.body.style.transform = '';
        document.body.style.position = '';
        
        // Очищаем все модальные окна, если они остались
        document.querySelectorAll('.modal-overlay, .order-confirmation').forEach(modal => {
            modal.remove();
        });
        
        // Показываем сообщение об успешном создании заказа
        showToast(`Заказ оформлен!\nПеремещен в раздел "Мои заказы"\nНомер: #${finalOrderId.slice(-6)}`, 'success', 4000);
        
        // Обновляем отображение корзины (покажем пустую корзину)
        // Всегда показываем корзину после оформления заказа, даже если пользователь был на другой странице
            showCart();
        
        // Тактильная обратная связь
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
    };
    
    // Показываем неблокирующее подтверждение заказа
    showOrderConfirmation(orderText, completeOrder);
}

// Проверка статуса заказа на сервере
function checkOrderStatus(orderId) {
    // Останавливаем предыдущую проверку, если она была
    if (orderStatusCheckIntervals[orderId]) {
        clearInterval(orderStatusCheckIntervals[orderId]);
    }
    
    let attempts = 0;
    const maxAttempts = 120; // Проверяем 10 минут (120 раз по 5 секунд)
    
    // Сразу делаем первую проверку статуса
    (async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/orders/${orderId}/status`);
            const data = await response.json();
            
            if (data.success && data.status) {
                const order = orders.find(o => o.id === orderId);
                if (order) {
                    const oldStatus = order.status;
                    
                    // Если статус изменился, обновляем сразу
                    if (oldStatus !== data.status) {
                        order.status = data.status;
                        localStorage.setItem('orders', JSON.stringify(orders));
                        
                        // Показываем уведомление при отклонении заказа
                        if (data.status === 'rejected') {
                            showToast('Заказ отклонен менеджером', 'error', 4000);
                        }
                    }
                    
                    // ВАЖНО: Если статус 'transferred', проверяем и начисляем коины/штампы ТОЛЬКО если еще не начислены
                    // Это предотвращает повторное начисление при каждом входе в приложение
                    const isTransferred = data.status === 'transferred' || order.status === 'transferred';
                    if (isTransferred) {
                        // ВАЖНО: Проверяем флаги начисления ПЕРЕД любыми действиями
                        const coinsAlreadyAdded = localStorage.getItem(`coins_added_${orderId}`);
                        const stampsAlreadyAdded = localStorage.getItem(`stamps_added_${orderId}`);
                        
                        // Если коины и штампы уже начислены, просто обновляем статус и выходим
                        if (coinsAlreadyAdded && stampsAlreadyAdded) {
                            order.status = 'transferred';
                            if (data.order && data.order.vapeCoinsEarned !== undefined) {
                                order.vapeCoinsEarned = data.order.vapeCoinsEarned;
                            }
                            localStorage.setItem('orders', JSON.stringify(orders));
                            console.log(`✅ Заказ ${orderId} уже обработан, пропускаем начисление`);
                            return; // ВАЖНО: Выходим, не запуская setInterval
                        }
                        
                        // Начисляем коины только если еще не начислены
                        let coinsEarned = 0;
                        if (data.order && data.order.vapeCoinsEarned !== undefined && data.order.vapeCoinsEarned !== null) {
                            coinsEarned = data.order.vapeCoinsEarned;
                        } else if (order.items && Array.isArray(order.items)) {
                            order.items.forEach(item => {
                                const paymentMethod = item.paymentMethod || 'money';
                                if (paymentMethod === 'money') {
                                    coinsEarned += (item.price * item.quantity) / 10;
                                }
                            });
                        }
                        
                        // Сохраняем coinsEarned в заказе для отображения
                        order.vapeCoinsEarned = coinsEarned;
                        localStorage.setItem('orders', JSON.stringify(orders));
                        
                        // Начисляем коины только если еще не начислены
                        if (!coinsAlreadyAdded && coinsEarned > 0) {
                            console.log('Начисляем коины за заказ (первая проверка):', orderId, 'Сумма:', coinsEarned, 'Статус:', data.status, 'Локальный статус:', order.status);
                            // Синхронизируем коины с сервером
                            syncVapeCoinsToServer(coinsEarned, `Заказ #${orderId.slice(-6)}`).then(() => {
                                localStorage.setItem(`coins_added_${orderId}`, 'true');
                            });
                            
                            const savedHistory = localStorage.getItem('vapeCoinsHistory');
                            let history = savedHistory ? JSON.parse(savedHistory) : [];
                            history.unshift({
                                id: `vc_${Date.now()}`,
                                date: new Date().toISOString(),
                                type: 'earned',
                                amount: coinsEarned,
                                description: `Начислено за заказ: #${orderId.slice(-6)}`,
                                orderId: orderId
                            });
                            localStorage.setItem('vapeCoinsHistory', JSON.stringify(history));
                        }
                        
                        // Начисляем штампы (stampsAlreadyAdded уже проверен выше)
                        if (!stampsAlreadyAdded) {
                            const savedStamps = localStorage.getItem('stamps');
                            let totalStampsValue = savedStamps ? parseInt(savedStamps) : 0;
                            
                            const totalItems = order.items.reduce((sum, item) => {
                                const paymentMethod = item.paymentMethod || 'money';
                                if (paymentMethod === 'money') {
                                    return sum + item.quantity;
                                }
                                return sum;
                            }, 0);
                            
                                if (totalItems > 0) {
                                    // Загружаем частичный прогресс
                                    const savedPartialProgress = localStorage.getItem('partialItemsProgress');
                                    let currentPartialProgress = savedPartialProgress ? parseFloat(savedPartialProgress) : 0;
                                    
                                    // Добавляем прогресс от текущего заказа (1 товар = 0.5 штампа)
                                    const totalProgress = currentPartialProgress + (totalItems / 2);
                                    const stampsToAdd = Math.floor(totalProgress);
                                    const newPartialProgress = totalProgress - stampsToAdd; // Остаток (0-0.99)
                                    
                                    // ВСЕГДА сохраняем прогресс, даже если целых штампов не добавилось
                                    const oldTotalStamps = totalStampsValue;
                                    totalStampsValue += stampsToAdd;
                                    localStorage.setItem('stamps', totalStampsValue.toString());
                                    localStorage.setItem('partialItemsProgress', newPartialProgress.toString());
                                    localStorage.setItem(`stamps_added_${orderId}`, 'true');
                                    
                                    // Обновляем глобальные переменные
                                    completedStampSets = Math.floor(totalStampsValue / 10);
                                    stamps = totalStampsValue % 10;
                                    partialItemsProgress = newPartialProgress;
                                    
                                    // ВАЖНО: Синхронизируем штампы с сервером
                                    await syncStampsToServer(totalStampsValue);
                                    
                                    // Проверяем бонусы за штампы (5 и 10)
                                    // Проверяем бонус за 5 штампов (только если перешли порог 5)
                                    const oldStampsMod10 = oldTotalStamps % 10;
                                    const newStampsMod10 = totalStampsValue % 10;
                                    let bonus5Coins = 0;
                                    
                                    // Если перешли порог 5 штампов (было меньше 5, стало 5 или больше)
                                    if (oldStampsMod10 < 5 && newStampsMod10 >= 5) {
                                        bonus5Coins = 5;
                                        
                                        // Загружаем актуальный баланс коинов
                                        const savedCoins = localStorage.getItem('vapeCoins');
                                        let currentCoins = savedCoins ? parseFloat(savedCoins) : 0;
                                        currentCoins += bonus5Coins;
                                        localStorage.setItem('vapeCoins', currentCoins.toString());
                                        
                                        // Обновляем глобальную переменную vapeCoins
                                        vapeCoins = currentCoins;
                                        
                                        const savedHistory = localStorage.getItem('vapeCoinsHistory');
                                        let history = savedHistory ? JSON.parse(savedHistory) : [];
                                        history.unshift({
                                            id: `vc_${Date.now()}`,
                                            date: new Date().toISOString(),
                                            type: 'earned',
                                            amount: bonus5Coins,
                                            description: 'Бонус за 5 штампов',
                                            orderId: orderId
                                        });
                                        localStorage.setItem('vapeCoinsHistory', JSON.stringify(history));
                                        
                                        // Обновляем глобальную переменную vapeCoinsHistory
                                        vapeCoinsHistory = history;
                                    }
                                    
                                    // Проверяем бонус за 10 штампов
                                    const oldSets = Math.floor(oldTotalStamps / 10);
                                    const newSets = Math.floor(totalStampsValue / 10);
                                    const newCompletedSets = newSets - oldSets;
                                    let bonus10Coins = 0;
                                    
                                    if (newCompletedSets > 0) {
                                        bonus10Coins = newCompletedSets * 10;
                                        
                                        // Загружаем актуальный баланс коинов
                                        const savedCoins = localStorage.getItem('vapeCoins');
                                        let currentCoins = savedCoins ? parseFloat(savedCoins) : 0;
                                        currentCoins += bonus10Coins;
                                        localStorage.setItem('vapeCoins', currentCoins.toString());
                                        
                                        // Обновляем глобальную переменную vapeCoins
                                        vapeCoins = currentCoins;
                                        
                                        const savedHistory = localStorage.getItem('vapeCoinsHistory');
                                        let history = savedHistory ? JSON.parse(savedHistory) : [];
                                        history.unshift({
                                            id: `vc_${Date.now()}`,
                                            date: new Date().toISOString(),
                                            type: 'earned',
                                            amount: bonus10Coins,
                                            description: `Бонус за ${newCompletedSets} ${newCompletedSets === 1 ? 'набор из 10 штампов' : 'наборов из 10 штампов'}`,
                                            orderId: orderId
                                        });
                                        localStorage.setItem('vapeCoinsHistory', JSON.stringify(history));
                                        
                                        // Обновляем глобальную переменную vapeCoinsHistory
                                        vapeCoinsHistory = history;
                                    }
                                    
                                    // Обновляем UI акций для отображения прогресса штампов
                                    if (currentPage === 'promotions') {
                                        setTimeout(() => {
                                            showPromotions();
                                        }, 100);
                                    }
                            }
                        }
                        
                        // Перезагружаем заказы и обновляем UI
                        const savedOrders = localStorage.getItem('orders');
                        if (savedOrders) {
                            try {
                                const parsedOrders = JSON.parse(savedOrders);
                                if (Array.isArray(parsedOrders)) {
                                    orders = parsedOrders;
                                }
                            } catch (e) {
                                console.error('Error loading orders:', e);
                            }
                        }
                        showOrders();
                    }
                }
            }
        } catch (error) {
            console.error('Error checking order status (initial):', error);
        }
    })();
    
    // ВАЖНО: Проверяем, не запущена ли уже проверка для этого заказа
    if (orderStatusCheckIntervals[orderId]) {
        console.log(`⚠️ Проверка статуса для заказа ${orderId} уже запущена, пропускаем`);
        return;
    }
    
    orderStatusCheckIntervals[orderId] = setInterval(async () => {
        attempts++;
        
        // ВАЖНО: Останавливаем проверку после максимального количества попыток
        if (attempts >= maxAttempts) {
            clearInterval(orderStatusCheckIntervals[orderId]);
            delete orderStatusCheckIntervals[orderId];
            return;
        }
        
        try {
            const response = await fetch(`${SERVER_URL}/api/orders/${orderId}/status`);
            const data = await response.json();
            
            if (data.success && data.status) {
                const order = orders.find(o => o.id === orderId);
                if (order) {
                    const oldStatus = order.status;
                    
                    // Если статус изменился, обновляем локальное хранилище
                    if (oldStatus !== data.status) {
                        // ОБЯЗАТЕЛЬНО обновляем статус заказа
                        order.status = data.status;
                        localStorage.setItem('orders', JSON.stringify(orders));
                        
                        if (data.status === 'confirmed') {
                            showToast('Заказ подтвержден менеджером!', 'success', 4000);
                            // ВАЖНО: Синхронизируем заказы с сервером
                            if (window.userDataManager && window.userDataManager.updateUserData) {
                                window.userDataManager.updateUserData({
                                    orders: orders
                                }).catch(err => {
                                    console.error('Ошибка синхронизации заказов:', err);
                                });
                            }
                            // Обновляем отображение заказов только если на странице заказов
                            if (currentPage === 'orders') {
                                setTimeout(() => {
                                    showOrders();
                                }, 100);
                            }
                        } else if (data.status === 'rejected') {
                            // Показываем уведомление об отклонении заказа
                            showToast('Заказ отклонен менеджером', 'error', 4000);
                            // ВАЖНО: Синхронизируем заказы с сервером
                            if (window.userDataManager && window.userDataManager.updateUserData) {
                                window.userDataManager.updateUserData({
                                    orders: orders
                                }).catch(err => {
                                    console.error('Ошибка синхронизации заказов:', err);
                                });
                            }
                            // Обновляем отображение заказов только если на странице заказов
                            if (currentPage === 'orders') {
                                setTimeout(() => {
                                    showOrders();
                                }, 100);
                            }
                        } else if (data.status === 'transferred') {
                            console.log('Order status changed to transferred:', orderId);
                            // ОБЯЗАТЕЛЬНО обновляем статус заказа еще раз для гарантии
                            order.status = 'transferred';
                            // Обновляем vapeCoinsEarned если есть
                            if (data.order && data.order.vapeCoinsEarned !== undefined && data.order.vapeCoinsEarned !== null) {
                                order.vapeCoinsEarned = data.order.vapeCoinsEarned;
                            }
                            localStorage.setItem('orders', JSON.stringify(orders));
                            console.log('Order status saved to localStorage:', order.status);
                            
                            // Начисляем Vape Coins за заказ (только если еще не начислены)
                            let coinsEarned = 0;
                            if (data.order && data.order.vapeCoinsEarned !== undefined && data.order.vapeCoinsEarned !== null) {
                                coinsEarned = data.order.vapeCoinsEarned;
                            } else {
                                // Если сервер не вернул vapeCoinsEarned, вычисляем сами
                                if (order.items && Array.isArray(order.items)) {
                                    order.items.forEach(item => {
                                        const paymentMethod = item.paymentMethod || 'money';
                                        if (paymentMethod === 'money') {
                                            coinsEarned += (item.price * item.quantity) / 10;
                                        }
                                    });
                                }
                            }
                            
                            // Сохраняем coinsEarned в заказе для отображения
                            order.vapeCoinsEarned = coinsEarned;
                            
                            // Проверяем, не начислены ли уже коины за этот заказ
                            const coinsAlreadyAdded = localStorage.getItem(`coins_added_${orderId}`);
                            
                            // ВСЕГДА начисляем коины если они есть и еще не начислены
                            if (!coinsAlreadyAdded && coinsEarned > 0) {
                                console.log('Начисляем коины за заказ (setInterval):', orderId, 'Сумма:', coinsEarned);
                                // Загружаем актуальный баланс коинов
                                const savedCoins = localStorage.getItem('vapeCoins');
                                if (savedCoins) {
                                    vapeCoins = parseFloat(savedCoins) || 0;
                                }
                                
                                vapeCoins += coinsEarned;
                                localStorage.setItem('vapeCoins', vapeCoins.toString());
                                localStorage.setItem(`coins_added_${orderId}`, 'true'); // Помечаем что коины начислены
                                
                                // Загружаем актуальную историю
                                const savedHistory = localStorage.getItem('vapeCoinsHistory');
                                if (savedHistory) {
                                    try {
                                        vapeCoinsHistory = JSON.parse(savedHistory);
                                    } catch (e) {
                                        vapeCoinsHistory = [];
                                    }
                                }
                                
                                // Добавляем транзакцию в историю
                                vapeCoinsHistory.unshift({
                                    id: `vc_${Date.now()}`,
                                    date: new Date().toISOString(),
                                    type: 'earned',
                                    amount: coinsEarned,
                                    description: `Начислено за заказ: #${orderId.slice(-6)}`,
                                    orderId: orderId
                                });
                                localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                                
                                // ВАЖНО: Синхронизируем транзакции с сервером
                                if (window.userDataManager && window.userDataManager.updateUserData) {
                                    window.userDataManager.updateUserData({
                                        vapeCoins: vapeCoins,
                                        transactions: vapeCoinsHistory
                                    }).catch(err => {
                                        console.error('Ошибка синхронизации транзакций:', err);
                                    });
                                }
                            }
                            
                        // Начисляем штампы за заказ (2 товара = 1 штамп, только за товары оплаченные деньгами)
                        // ВАЖНО: stampsAlreadyAdded уже проверен выше
                        let stampsToAdd = 0;
                        let bonusCoins = 0;
                        
                        if (!stampsAlreadyAdded) {
                                // Загружаем актуальное количество штампов
                                const savedStamps = localStorage.getItem('stamps');
                                let totalStampsValue = savedStamps ? parseInt(savedStamps) : 0;
                                
                                const totalItems = order.items.reduce((sum, item) => {
                                    const paymentMethod = item.paymentMethod || 'money';
                                    if (paymentMethod === 'money') {
                                        return sum + item.quantity;
                                    }
                                    return sum;
                                }, 0);
                                
                                if (totalItems > 0) {
                                    // Загружаем частичный прогресс
                                    const savedPartialProgress = localStorage.getItem('partialItemsProgress');
                                    let currentPartialProgress = savedPartialProgress ? parseFloat(savedPartialProgress) : 0;
                                    
                                    // Добавляем прогресс от текущего заказа (1 товар = 0.5 штампа)
                                    const totalProgress = currentPartialProgress + (totalItems / 2);
                                    stampsToAdd = Math.floor(totalProgress);
                                    const newPartialProgress = totalProgress - stampsToAdd; // Остаток (0-0.99)
                                    
                                    // ВСЕГДА сохраняем прогресс, даже если целых штампов не добавилось
                                    const oldTotalStamps = totalStampsValue;
                                    totalStampsValue += stampsToAdd;
                                    localStorage.setItem('stamps', totalStampsValue.toString());
                                    localStorage.setItem('partialItemsProgress', newPartialProgress.toString());
                                    localStorage.setItem(`stamps_added_${orderId}`, 'true'); // Помечаем что штампы начислены
                                    
                                    // Обновляем глобальные переменные
                                    completedStampSets = Math.floor(totalStampsValue / 10);
                                    stamps = totalStampsValue % 10;
                                    partialItemsProgress = newPartialProgress;
                                    
                                    // ВАЖНО: Синхронизируем штампы с сервером
                                    await syncStampsToServer(totalStampsValue);
                                    
                                    // Проверяем бонусы за штампы (5 и 10)
                                    // Проверяем бонус за 5 штампов (только если перешли порог 5)
                                    const oldStampsMod10 = oldTotalStamps % 10;
                                    const newStampsMod10 = totalStampsValue % 10;
                                    let bonus5Coins = 0;
                                    
                                    // Если перешли порог 5 штампов (было меньше 5, стало 5 или больше)
                                    if (oldStampsMod10 < 5 && newStampsMod10 >= 5) {
                                        bonus5Coins = 5;
                                        
                                        // Загружаем актуальный баланс коинов
                                        const savedCoins = localStorage.getItem('vapeCoins');
                                        if (savedCoins) {
                                            vapeCoins = parseFloat(savedCoins) || 0;
                                        }
                                        
                                        vapeCoins += bonus5Coins;
                                        localStorage.setItem('vapeCoins', vapeCoins.toString());
                                        
                                        // Загружаем актуальную историю
                                        const savedHistory = localStorage.getItem('vapeCoinsHistory');
                                        if (savedHistory) {
                                            try {
                                                vapeCoinsHistory = JSON.parse(savedHistory);
                                            } catch (e) {
                                                vapeCoinsHistory = [];
                                            }
                                        }
                                        
                                        vapeCoinsHistory.unshift({
                                            id: `vc_${Date.now()}`,
                                            date: new Date().toISOString(),
                                            type: 'earned',
                                            amount: bonus5Coins,
                                            description: 'Бонус за 5 штампов',
                                            orderId: orderId
                                        });
                                        localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                                        
                                        // ВАЖНО: Синхронизируем коины и транзакции с сервером
                                        if (window.userDataManager && window.userDataManager.updateUserData) {
                                            window.userDataManager.updateUserData({
                                                vapeCoins: vapeCoins,
                                                transactions: vapeCoinsHistory
                                            }).catch(err => {
                                                console.error('Ошибка синхронизации бонуса за 5 штампов:', err);
                                            });
                                        }
                                    }
                                    
                                    // Проверяем бонус за 10 штампов
                                    const oldSets = Math.floor(oldTotalStamps / 10);
                                    const newSets = Math.floor(totalStampsValue / 10);
                                    const newCompletedSets = newSets - oldSets;
                                    
                                    if (newCompletedSets > 0) {
                                        bonusCoins = newCompletedSets * 10;
                                        
                                        // Загружаем актуальный баланс коинов
                                        const savedCoins = localStorage.getItem('vapeCoins');
                                        if (savedCoins) {
                                            vapeCoins = parseFloat(savedCoins) || 0;
                                        }
                                        
                                        vapeCoins += bonusCoins;
                                        localStorage.setItem('vapeCoins', vapeCoins.toString());
                                        
                                        // Загружаем актуальную историю
                                        const savedHistory = localStorage.getItem('vapeCoinsHistory');
                                        if (savedHistory) {
                                            try {
                                                vapeCoinsHistory = JSON.parse(savedHistory);
                                            } catch (e) {
                                                vapeCoinsHistory = [];
                                            }
                                        }
                                        
                                        vapeCoinsHistory.unshift({
                                            id: `vc_${Date.now()}`,
                                            date: new Date().toISOString(),
                                            type: 'earned',
                                            amount: bonusCoins,
                                            description: `Бонус за ${newCompletedSets} ${newCompletedSets === 1 ? 'набор из 10 штампов' : 'наборов из 10 штампов'}`,
                                            orderId: orderId
                                        });
                                        localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                                        
                                        // ВАЖНО: Синхронизируем коины и транзакции с сервером
                                        if (window.userDataManager && window.userDataManager.updateUserData) {
                                            window.userDataManager.updateUserData({
                                                vapeCoins: vapeCoins,
                                                transactions: vapeCoinsHistory
                                            }).catch(err => {
                                                console.error('Ошибка синхронизации бонуса за 10 штампов:', err);
                                            });
                                        }
                                    }
                                    
                                    // Обновляем bonusCoins для уведомления
                                    bonusCoins = bonus5Coins + (bonusCoins || 0);
                                }
                            }
                            
                            // Формируем сообщение
                            let toastMessage = '';
                            const coinsEarnedValue = data.order && data.order.vapeCoinsEarned !== undefined && data.order.vapeCoinsEarned !== null ? data.order.vapeCoinsEarned : (coinsEarned || 0);
                            
                            // Показываем информацию о прогрессе штампов даже если целых штампов не добавилось
                            const savedPartialProgress = localStorage.getItem('partialItemsProgress');
                            const currentPartialProgress = savedPartialProgress ? parseFloat(savedPartialProgress) : 0;
                            const partialProgressPercent = Math.round(currentPartialProgress * 100);
                            
                            // Определяем текст для штампов (с учетом 0.5)
                            let stampsText = '';
                            // ВАЖНО: Проверяем, были ли начислены штампы (stampsToAdd > 0) или есть частичный прогресс
                            if (stampsToAdd > 0) {
                                stampsText = `+ ${stampsToAdd} ${stampsToAdd === 1 ? 'штамп' : stampsToAdd < 5 ? 'штампа' : 'штампов'}`;
                            } else if (currentPartialProgress > 0 && !stampsAlreadyAdded) {
                                // Если добавился только частичный прогресс (0.5 штампа) и штампы еще не начислялись
                                stampsText = `+ 0.5 штампа`;
                            }
                            
                            // ВАЖНО: Правильно формируем сообщение - сначала штампы, потом коины
                            if (stampsText && coinsEarnedValue > 0) {
                                toastMessage = `Заказ передан!\n${stampsText}\n+ ${coinsEarnedValue.toFixed(1)} коинов`;
                            } else if (stampsText) {
                                toastMessage = `Заказ передан!\n${stampsText}`;
                            } else if (coinsEarnedValue > 0) {
                                toastMessage = `Заказ передан! Начислено ${coinsEarnedValue.toFixed(1)} коинов`;
                            } else {
                                toastMessage = 'Заказ передан клиенту';
                            }
                            
                            showToast(toastMessage, 'success', 5000);
                            
                            // Показываем уведомления о бонусах
                            if (bonus5Coins > 0) {
                                setTimeout(() => {
                                    showToast(`Награда за 5 штампов!\n+ ${bonus5Coins} коинов`, 'success', 4000);
                                }, 3500);
                            }
                            
                            if (bonusCoins > 0 && bonusCoins !== bonus5Coins) {
                                setTimeout(() => {
                                    showToast(`Бонус за штампы!\n+ ${bonusCoins - (bonus5Coins || 0)} коинов`, 'success', 4000);
                                }, bonus5Coins > 0 ? 8000 : 3500);
                            }
                            
                            // ОБЯЗАТЕЛЬНО сохраняем финальный статус
                            order.status = 'transferred';
                            if (data.order && data.order.vapeCoinsEarned !== undefined && data.order.vapeCoinsEarned !== null) {
                                order.vapeCoinsEarned = data.order.vapeCoinsEarned;
                            }
                            localStorage.setItem('orders', JSON.stringify(orders));
                            console.log('Final order status saved:', order.status, order.vapeCoinsEarned);
                            
                            // ВАЖНО: Обновляем заказы в БД через userDataManager для синхронизации
                            if (window.userDataManager && window.userDataManager.updateUserData) {
                                window.userDataManager.updateUserData({
                                    orders: orders
                                }).catch(err => {
                                    console.error('Ошибка синхронизации заказов:', err);
                                });
                            }
                            
                            // Обновляем отображение заказов ОДИН РАЗ, только если на странице заказов
                            if (currentPage === 'orders') {
                                setTimeout(() => {
                                    showOrders();
                                }, 100);
                            }
                        }
                        
                        // Обновляем баланс Vape Coins, если пользователь на странице Vape Coins
                        if (currentPage === 'vapeCoins') {
                            showVapeCoins();
                        }
                    }
                    
                    // Если заказ подтвержден, отклонен или передан, останавливаем проверку
                    // НО только после того, как статус обновлен и сохранен
                    if (data.status === 'confirmed' || data.status === 'rejected' || data.status === 'transferred') {
                        // Даем время на обновление UI перед остановкой проверки
                        setTimeout(() => {
                            if (orderStatusCheckIntervals[orderId]) {
                        clearInterval(orderStatusCheckIntervals[orderId]);
                        delete orderStatusCheckIntervals[orderId];
                            }
                        }, 2000); // Останавливаем через 2 секунды после обновления
                    }
                }
            }
        } catch (error) {
            console.error('Error checking order status:', error);
        }
        
        // Останавливаем проверку после максимального количества попыток
        if (attempts >= maxAttempts) {
            clearInterval(orderStatusCheckIntervals[orderId]);
            delete orderStatusCheckIntervals[orderId];
        }
    }, 5000); // ВАЖНО: Увеличиваем интервал до 5 секунд, чтобы избежать перегрузки и бесконечных циклов
}

// Функция для создания SVG монеты
function createStampSVG(isFilled = false, uniqueId = '') {
    // Цвета для монеты: золотой/оранжевый когда заполнена, серый когда пустая
    const coinFillColor = isFilled ? '#FF9800' : '#e5e5e5';
    const coinGradientColor = isFilled ? '#FFB300' : '#d0d0d0';
    const strokeColor = isFilled ? '#F57C00' : '#ccc';
    const textColor = isFilled ? '#ffffff' : '#999';
    
    return `
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="display: block; margin: auto; overflow: visible;">
            <defs>
                <linearGradient id="coinGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${coinGradientColor};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:${coinFillColor};stop-opacity:1" />
                </linearGradient>
                <!-- Эффект тени для объема -->
                <filter id="coinShadow${uniqueId}">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                    <feOffset dx="0" dy="1" result="offsetblur"/>
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.3"/>
                    </feComponentTransfer>
                    <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <!-- Внешний круг монеты (основной) - всегда заполнен полностью -->
            <circle cx="50" cy="50" r="48" fill="url(#coinGradient${uniqueId})" 
                    stroke="${strokeColor}" stroke-width="2" 
                    filter="url(#coinShadow${uniqueId})" opacity="1"/>
            <!-- Внутренний ободок для объема -->
            <circle cx="50" cy="50" r="40" fill="none" 
                    stroke="${isFilled ? '#ffffff' : 'rgba(255,255,255,0.3)'}" 
                    stroke-width="1" opacity="${isFilled ? '0.3' : '0.2'}"/>
            <!-- Текст "VAPE COIN" в центре -->
            <text x="50" y="42" font-family="Arial, sans-serif" font-size="9" font-weight="bold" 
                  fill="${textColor}" text-anchor="middle" dominant-baseline="middle"
                  opacity="${isFilled ? '1' : '0.6'}">
                VAPE
            </text>
            <text x="50" y="55" font-family="Arial, sans-serif" font-size="9" font-weight="bold" 
                  fill="${textColor}" text-anchor="middle" dominant-baseline="middle"
                  opacity="${isFilled ? '1' : '0.6'}">
                COIN
            </text>
            <!-- Декоративные точки по кругу -->
            <circle cx="50" cy="15" r="2" fill="${textColor}" opacity="${isFilled ? '0.6' : '0.3'}"/>
            <circle cx="50" cy="85" r="2" fill="${textColor}" opacity="${isFilled ? '0.6' : '0.3'}"/>
            <circle cx="15" cy="50" r="2" fill="${textColor}" opacity="${isFilled ? '0.6' : '0.3'}"/>
            <circle cx="85" cy="50" r="2" fill="${textColor}" opacity="${isFilled ? '0.6' : '0.3'}"/>
        </svg>
    `;
}

// Иконка трофея (SVG)
function getTrophyIcon(color = '#FF9800') {
    return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 5H5V3H19V5ZM17 5V13C17 15.21 15.21 17 13 17H11C8.79 17 7 15.21 7 13V5H17ZM9 5V13C9 14.1 9.9 15 11 15H13C14.1 15 15 14.1 15 13V5H9ZM5 19H19V21H5V19Z" fill="${color}"/>
    </svg>`;
}

// Иконка информации (SVG)
function getInfoIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2" fill="none"/>
        <path d="M12 16V12M12 8H12.01" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка успеха (SVG)
function getSuccessIcon(color = '#4CAF50') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="${color}"/>
        <path d="M8 12L11 15L16 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка корзины (SVG)
function getCartIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 18C5.9 18 5.01 18.9 5.01 20C5.01 21.1 5.9 22 7 22C8.1 22 9 21.1 9 20C9 18.9 8.1 18 7 18ZM1 2V4H3L6.6 11.59L5.25 14.04C5.09 14.32 5 14.65 5 15C5 16.1 5.9 17 7 17H19V15H7.42C7.28 15 7.17 14.89 7.17 14.75L7.2 14.63L8.1 13H16.55C17.3 13 17.96 12.59 18.3 11.97L21.88 5.48C21.96 5.34 22 5.17 22 5C22 4.45 21.55 4 21 4H5.21L4.27 2H1ZM17 18C15.9 18 15.01 18.9 15.01 20C15.01 21.1 15.9 22 17 22C18.1 22 19 21.1 19 20C19 18.9 18.1 18 17 18Z" fill="${color}"/>
    </svg>`;
}

// Иконка пользователя (SVG)
function getUserIcon(color = '#9C27B0') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="4" fill="${color}"/>
        <path d="M6 21V19C6 15.6863 8.6863 13 12 13C15.3137 13 18 15.6863 18 19V21" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка монеты (SVG)
function getCoinIcon(color = '#FF9800', size = 24) {
    const isWhite = color === '#ffffff' || color.toLowerCase() === '#ffffff';
    const darkColor = color === '#FF9800' ? '#FF6F00' : (isWhite ? '#FF6F00' : '#FF6F00');
    const lightColor = color === '#FF9800' ? '#FFB74D' : (isWhite ? '#FFB74D' : '#FFB74D');
    const veryLightColor = color === '#FF9800' ? '#FFE0B2' : (isWhite ? '#FFE0B2' : '#FFE0B2');
    const coinColor = isWhite ? '#FF9800' : color;
    const uniqueId = `coinGrad${color.replace('#', '')}${size}${Math.random().toString(36).substr(2, 5)}`;
    const scale = size / 24;
    const whiteCircleOpacity = isWhite ? '0' : '0.15';
    const whiteCircle2Opacity = isWhite ? '0' : '0.1';
    const shineOpacity = isWhite ? '0.1' : '0.4';
    const extraShineOpacity = isWhite ? '0' : '0.3';
    const textColor = isWhite ? 'white' : 'white';
    const textStroke = isWhite ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.15)';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${veryLightColor};stop-opacity:1" />
                <stop offset="30%" style="stop-color:${lightColor};stop-opacity:1" />
                <stop offset="60%" style="stop-color:${coinColor};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${darkColor};stop-opacity:1" />
            </linearGradient>
            <radialGradient id="coinShine${uniqueId}" cx="30%" cy="30%">
                <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.3" />
                <stop offset="50%" style="stop-color:#ffffff;stop-opacity:0.1" />
                <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0" />
            </radialGradient>
            <linearGradient id="coinEdge${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${lightColor};stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:${darkColor};stop-opacity:0.8" />
            </linearGradient>
        </defs>
        <!-- Тень монеты -->
        <ellipse cx="12" cy="13.5" rx="9" ry="3" fill="rgba(0,0,0,0.2)"/>
        <!-- Основной круг монеты с усиленным градиентом -->
        <circle cx="12" cy="12" r="10" fill="url(#${uniqueId})" stroke="url(#coinEdge${uniqueId})" stroke-width="1"/>
        <!-- Внутренний круг для объема (скрыт для белого цвета) -->
        <circle cx="12" cy="12" r="8.5" stroke="white" stroke-width="0.8" fill="none" opacity="${whiteCircleOpacity}"/>
        <circle cx="12" cy="12" r="7" stroke="white" stroke-width="0.5" fill="none" opacity="${whiteCircle2Opacity}"/>
        <!-- Блеск с уменьшенным эффектом -->
        <ellipse cx="9" cy="9" rx="4" ry="5" fill="url(#coinShine${uniqueId})" opacity="${shineOpacity}"/>
        <!-- Дополнительный блеск снизу (скрыт для белого цвета) -->
        <ellipse cx="15" cy="15" rx="2" ry="3" fill="rgba(255,255,255,0.1)" opacity="${extraShineOpacity}"/>
        <!-- Буква V (поднята выше) -->
        <text x="12" y="13.2" font-family="Arial, sans-serif" font-size="10" font-weight="900" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" opacity="0.98" stroke="${textStroke}" stroke-width="0.3">V</text>
        <!-- Обводка для четкости -->
        <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.2)" stroke-width="0.4" fill="none"/>
    </svg>`;
}

// Иконка настроек (SVG)
function getSettingsIcon(color = '#666666') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.01131 9.77251C4.28062 9.5799 4.48574 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15H19.4Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка сердца (пустое) (SVG) - более красивая и современная
function getHeartEmptyIcon(color = '#999999') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
}

// Иконка сердца (заполненное) (SVG) - более красивая и современная
function getHeartFilledIcon(color = '#ff4444') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="${color}" stroke="${color}" stroke-width="0.5"/>
    </svg>`;
}

// Иконка коробки/заказа (SVG)
function getPackageIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 16V8C20.9996 7.64928 20.9071 7.30481 20.7315 7.00116C20.556 6.69751 20.3037 6.44536 20 6.27L13 2.27C12.696 2.09446 12.3511 2.00205 12 2.00205C11.6489 2.00205 11.304 2.09446 11 2.27L4 6.27C3.69626 6.44536 3.44398 6.69751 3.26846 7.00116C3.09294 7.30481 3.00036 7.64928 3 8V16C3.00036 16.3507 3.09294 16.6952 3.26846 16.9988C3.44398 17.3025 3.69626 17.5546 4 17.73L11 21.73C11.304 21.9055 11.6489 21.9979 12 21.9979C12.3511 21.9979 12.696 21.9055 13 21.73L20 17.73C20.3037 17.5546 20.556 17.3025 20.7315 16.9988C20.9071 16.6952 20.9996 16.3507 21 16Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.27 6.96L12 12.01L20.73 6.96" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 22.08V12" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка часов (обработка) (SVG)
function getClockIcon(color = '#FF9800') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2"/>
        <path d="M12 6V12L16 14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка крестика (отмена) (SVG)
function getCrossIcon(color = '#999999') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка копирования (SVG)
function getCopyIcon(color = '#666666') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка рефералов (SVG)
function getUsersIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка вопроса/помощи (SVG)
function getQuestionIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2"/>
        <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 17H12.01" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка локации (SVG)
function getLocationIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка денег/валюты (SVG)
function getMoneyIcon(color = '#4CAF50') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1V23M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6312 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6312 13.6815 18 14.5717 18 15.5C18 16.4283 17.6312 17.3185 16.9749 17.9749C16.3185 18.6312 15.4283 19 14.5 19H6" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка конфеты/вкуса (SVG)
function getCandyIcon(color = '#d32f2f') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="9" r="4" fill="${color}"/>
        <circle cx="15" cy="15" r="4" fill="${color}"/>
        <path d="M9 13L15 11" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка молнии/крепости (SVG)
function getLightningIcon(color = '#1976d2') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="${color}"/>
    </svg>`;
}

// Иконка поделиться (SVG) - красивая и стандартная
function getShareIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="5" r="2.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="6" cy="12" r="2.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="18" cy="19" r="2.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M8.59 13.51l6.83-3.02M15.41 6.51l-6.83-3.02" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка доллара/денег (SVG)
function getDollarIcon(color = '#4CAF50', size = 24) {
    const darkColor = color === '#4CAF50' ? '#2E7D32' : '#2E7D32';
    const uniqueId = `moneyGrad${color.replace('#', '')}${size}${Math.random().toString(36).substr(2, 5)}`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${darkColor};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect x="7" y="5" width="10" height="14" rx="2" fill="url(#${uniqueId})" stroke="${color}" stroke-width="1.5"/>
        <rect x="7" y="5" width="10" height="14" rx="2" stroke="white" stroke-width="0.5" fill="none" opacity="0.2"/>
        <circle cx="12" cy="9" r="1.2" fill="white" opacity="0.9"/>
        <circle cx="12" cy="15" r="1.2" fill="white" opacity="0.9"/>
        <path d="M9 7H15M9 11H15M9 17H15" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
        <path d="M12 10V14" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M10 12H14" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
}

// Иконка глаза/просмотра (SVG)
function getEyeIcon(color = '#666666') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="3" stroke="${color}" stroke-width="2"/>
    </svg>`;
}

// Иконка луны (SVG)
function getMoonIcon(color = '#666666') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z" fill="${color}"/>
    </svg>`;
}

// Иконка солнца (SVG)
function getSunIcon(color = '#FF9800') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="5" fill="${color}"/>
        <path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка заметки/документа (SVG)
function getNoteIcon(color = '#666666') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 2V8H20" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 13H8M16 17H8M10 9H8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// Иконка графика (SVG)
function getChartIcon(color = '#666666') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3V21H21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 16L12 11L16 15L21 10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 10H16V15" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка лампочки (SVG)
function getBulbIcon(color = '#FF9800') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 21H15M12 3C8.68629 3 6 5.68629 6 9C6 11.2091 7.20914 13 9 14C9.55228 14.5523 10 15.4477 10 16V17H14V16C14 15.4477 14.4477 14.5523 15 14C16.7909 13 18 11.2091 18 9C18 5.68629 15.3137 3 12 3Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка ценника/акции (SVG)
function getTagIcon(color = '#007AFF') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.59 13.41L13.42 20.58C13.2343 20.766 13.0007 20.9065 12.7416 20.9886C12.4825 21.0707 12.2055 21.0921 11.9325 21.0507C11.6595 21.0093 11.3982 20.906 11.17 20.75L3.62 16.25C3.45591 16.1377 3.31701 15.9933 3.21197 15.8258C3.10693 15.6583 3.03807 15.4714 3.01 15.28L2 8.28C1.97906 8.10176 1.99899 7.92051 2.05832 7.75027C2.11766 7.58003 2.21477 7.42496 2.343 7.296L11.293 3.293C11.4805 3.10553 11.7348 3.00021 12 3.00021C12.2652 3.00021 12.5195 3.10553 12.707 3.293L20.707 11.293C20.8945 11.4805 20.9998 11.7348 20.9998 12C20.9998 12.2652 20.8945 12.5195 20.707 12.707L20.59 13.41Z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="7" cy="7" r="1.5" fill="${color}"/>
    </svg>`;
}

// Иконка поиска (SVG)
function getSearchIcon(color = '#999999') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="11" r="8" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 21L16.65 16.65" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка меню/фильтра (SVG)
function getMenuIcon(color = '#000000') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12H21M3 6H21M3 18H21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// Иконка локации (SVG) - альтернативная версия для навигации
function getPinIcon(color = '#ffffff') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" fill="${color}"/>
        <circle cx="12" cy="10" r="3" fill="white"/>
    </svg>`;
}

// Инициализация SVG иконок вместо эмодзи
function initSVGIcons() {
    // Проверяем, что основной контент доступен
    const mainContent = document.getElementById('main-content');
    if (!mainContent || mainContent.classList.contains('hidden')) {
        // Если контент еще скрыт, повторим попытку позже
        setTimeout(() => {
            initSVGIcons();
        }, 300);
        return;
    }
    
    // Навигационные иконки
    const navCatalogIcon = document.getElementById('nav-catalog-icon');
    if (navCatalogIcon) {
        navCatalogIcon.innerHTML = getPackageIcon('#999');
    }
    
    const navPromotionsIcon = document.getElementById('nav-promotions-icon');
    if (navPromotionsIcon) {
        navPromotionsIcon.innerHTML = getTagIcon('#999');
    }
    
    const navCartIcon = document.getElementById('nav-cart-icon');
    if (navCartIcon) {
        navCartIcon.innerHTML = getCartIcon('#999');
    }
    
    const navFavoritesIcon = document.getElementById('nav-favorites-icon');
    if (navFavoritesIcon) {
        navFavoritesIcon.innerHTML = getHeartEmptyIcon('#999');
    }
    
    const navProfileIcon = document.getElementById('nav-profile-icon');
    if (navProfileIcon) {
        navProfileIcon.innerHTML = getUserIcon('#999');
    }
    
    // Иконка локации больше не используется в навигации (заменена на "vapeshop")
    
    // Иконка поиска
    const searchIconSvg = document.getElementById('search-icon-svg');
    if (searchIconSvg) {
        searchIconSvg.innerHTML = getSearchIcon('#999');
    }
    
    // Иконка фильтра
    const filterBtnIcon = document.getElementById('filter-btn-icon');
    if (filterBtnIcon) {
        filterBtnIcon.innerHTML = getMenuIcon('#000000');
    }
    
    // Обновляем цвета активной вкладки
    updateNavIcons();
}

// Обновление цветов навигационных иконок
function updateNavIcons() {
    const activeColor = '#007AFF';
    const inactiveColor = '#999';
    
    // Получаем все nav-item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const iconElement = item.querySelector('.nav-icon');
        if (!iconElement) return;
        
        const isActive = item.classList.contains('active');
        const onclick = item.getAttribute('onclick');
        
        if (!onclick) return;
        
        let iconHtml = '';
        if (onclick.includes("'catalog'")) {
            iconHtml = getPackageIcon(isActive ? activeColor : inactiveColor);
        } else if (onclick.includes("'promotions'")) {
            iconHtml = getTagIcon(isActive ? activeColor : inactiveColor);
        } else if (onclick.includes("'cart'")) {
            iconHtml = getCartIcon(isActive ? activeColor : inactiveColor);
        } else if (onclick.includes("'favorites'")) {
            iconHtml = getHeartEmptyIcon(isActive ? activeColor : inactiveColor);
        } else if (onclick.includes("'profile'")) {
            iconHtml = getUserIcon(isActive ? activeColor : inactiveColor);
        }
        
        if (iconHtml) {
            iconElement.innerHTML = iconHtml;
        }
    });
}

// Показать информацию о программе лояльности
function showLoyaltyProgramInfo() {
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    const colors = getThemeColors();
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        content.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        content.style.transform = 'scale(0.9) translateY(20px)';
        content.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: ${colors.bgCard};
        border-radius: 20px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        color: ${colors.text};
        transform: scale(0.9) translateY(20px);
        opacity: 0;
        transition: transform 0.3s ease, opacity 0.3s ease;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    content.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            ${getTrophyIcon('#FF9800')}
            <div style="flex: 1;">
                <div style="font-size: 20px; font-weight: 700; color: ${colors.text};">Программа лояльности</div>
            </div>
            <button onclick="this.closest('[style*=\\'position: fixed\\']').remove()" 
                style="background: none; border: none; color: ${colors.textSecondary}; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                ×
            </button>
        </div>
        
        <div style="line-height: 1.6; color: ${colors.text};">
            <div style="margin-bottom: 16px;">
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text};">Как работает программа:</div>
                <div style="color: ${colors.textSecondary}; font-size: 14px;">
                    За каждые 2 товара, оплаченные деньгами, вы получаете 1 штамп.
                </div>
            </div>
            
            <div style="margin-bottom: 16px; padding: 16px; background: ${colors.bgSecondary}; border-radius: 12px; border-left: 4px solid #FF9800;">
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                    ${getSuccessIcon('#FF9800')}
                    <span>5 штампов = 5 коинов</span>
                </div>
                <div style="color: ${colors.textSecondary}; font-size: 13px;">
                    При достижении 5 штампов вы автоматически получаете 5 Vape Coins на ваш баланс.
                </div>
            </div>
            
            <div style="margin-bottom: 16px; padding: 16px; background: ${colors.bgSecondary}; border-radius: 12px; border-left: 4px solid #4CAF50;">
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                    ${getSuccessIcon('#4CAF50')}
                    <span>10 штампов = 10 коинов</span>
                </div>
                <div style="color: ${colors.textSecondary}; font-size: 13px;">
                    При достижении 10 штампов вы получаете 10 Vape Coins, и начинается новый набор.
                </div>
            </div>
            
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid ${colors.border};">
                <div style="font-size: 12px; color: ${colors.textSecondary};">
                    <strong style="color: ${colors.text};">Важно:</strong> Штампы начисляются только за товары, оплаченные деньгами. Товары, оплаченные коинами, не дают штампы.
                </div>
            </div>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        content.style.transform = 'scale(1) translateY(0)';
        content.style.opacity = '1';
    });
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Показать акции
function showPromotions() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации - устанавливаем сразу
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    container.style.transition = 'none'; // Убираем transition для мгновенного установления начального состояния
    
    const currentStamps = stamps;
    const maxStamps = 10;
    
    // Принудительно обновляем частичный прогресс если он не определен
    if (typeof partialItemsProgress === 'undefined' || isNaN(partialItemsProgress)) {
        partialItemsProgress = 0;
    }
    
    container.innerHTML = `
        <div style="background: ${colors.bgCard}; padding: 24px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'});">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                <div style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; 
                    background: ${darkMode ? '#3a3a3a' : '#fff8e1'}; border-radius: 12px;">
                    ${getTrophyIcon('#FF9800')}
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px; color: ${colors.text};">Программа лояльности</div>
                    <div style="color: ${colors.textSecondary}; font-size: 14px;">2 товара = 1 штамп</div>
                </div>
                <button onclick="showLoyaltyProgramInfo()" 
                    style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; 
                    background: ${colors.bgSecondary}; border: 1px solid ${colors.border}; border-radius: 50%; 
                    cursor: pointer; transition: all 0.2s; padding: 0;" 
                    onmouseover="this.style.background='${colors.border}'"
                    onmouseout="this.style.background='${colors.bgSecondary}'">
                    ${getInfoIcon('#007AFF')}
                </button>
            </div>
            
            ${completedStampSets > 0 ? `
                <div style="background: ${darkMode ? '#2a4a2a' : '#E8F5E9'}; padding: 16px; border-radius: 12px; margin-bottom: 20px; 
                    border-left: 4px solid #4CAF50; transform: translateY(0); opacity: 1; transition: all 0.4s ease;">
                    <div style="color: #4CAF50; font-weight: 600; font-size: 16px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                        ${getSuccessIcon('#4CAF50')}
                        <span>Собрано полных наборов: ${completedStampSets}</span>
                    </div>
                    <div style="color: ${colors.textSecondary}; font-size: 13px;">
                        ${completedStampSets === 1 ? '1 полный набор из 10 штампов' : `${completedStampSets} полных наборов из 10 штампов`}
                    </div>
                </div>
            ` : ''}
            
            <div style="margin-bottom: 16px;">
                <div style="color: ${colors.textSecondary}; font-size: 14px; margin-bottom: 12px; font-weight: 600;">Текущий набор</div>
                <div style="position: relative; padding: 20px 0;">
                    <!-- Коины -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; position: relative; z-index: 2; margin-bottom: 12px; width: 100%; justify-items: center; align-items: center; grid-auto-rows: auto;">
                    ${Array.from({length: maxStamps}, (_, i) => {
                        const isFilled = i < currentStamps;
                        const isBonus5 = i === 4;
                        const isBonus10 = i === 9;
                        const row = Math.floor(i / 5);
                        const col = i % 5;
                        const isLastInRow = col === 4;
                        
                        // Определяем прогресс заполнения штампа
                        // Если это следующий штамп после последнего заполненного - показываем частичный прогресс
                        let stampProgress = isFilled ? 1 : 0; // 0-1 (0 = пусто, 1 = заполнено)
                        
                        if (!isFilled && i === currentStamps) {
                            // Если это следующий штамп после последнего заполненного - показываем частичный прогресс
                            stampProgress = partialItemsProgress;
                        }
                        
                        return `
                                <div style="width: 100%; max-width: 60px; aspect-ratio: 1; position: relative; display: flex; align-items: center; justify-content: center;">
                                    <div class="stamp-coin-${i}" style="width: 100%; height: 100%; border: ${stampProgress > 0 ? '2px solid #F57C00' : '2px solid ' + colors.border}; 
                                    border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                                        background: ${colors.bgCard}; 
                                        padding: 0; box-sizing: border-box; position: relative; z-index: 2; overflow: visible;
                                        opacity: 0; transform: scale(0.8); transition: none;">
                                    ${stampProgress > 0 && stampProgress < 1 ? `
                                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: ${stampProgress * 100}%; 
                                            background: linear-gradient(180deg, #FFB300 0%, #FF9800 100%); 
                                            border-radius: 0 0 50% 50%; z-index: 1; transition: height 0.5s ease; opacity: 0.8;"></div>
                                    ` : ''}
                                    <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; overflow: visible; border-radius: 50%; z-index: 2;">
                                        ${createStampSVG(stampProgress === 1, i)}
                                    </div>
                                        ${isBonus5 ? `<div style="position: absolute; bottom: -4px; right: -4px; width: 20px; height: 20px; 
                                            background: #FF9800; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                                            border: 2px solid ${colors.bgCard}; font-size: 10px; color: white; font-weight: 700; z-index: 15; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">5</div>` : ''}
                                        ${isBonus10 ? `<div style="position: absolute; bottom: -4px; right: -4px; width: 20px; height: 20px; 
                                            background: #4CAF50; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                                            border: 2px solid ${colors.bgCard}; font-size: 10px; color: white; font-weight: 700; z-index: 15; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">10</div>` : ''}
                                    </div>
                                </div>
                        `;
                    }).join('')}
                    </div>
                    <!-- Общая прогресс-полоска под коинами -->
                    <div style="position: relative; height: 4px; background: ${colors.border}; border-radius: 2px; margin-top: 8px;">
                        <div style="position: absolute; top: 0; left: 0; width: ${(currentStamps / maxStamps) * 100}%; height: 100%; 
                            background: linear-gradient(90deg, #FF9800 0%, #FFB300 100%); border-radius: 2px; 
                            transition: width 0.5s ease;"></div>
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; padding-top: 20px; border-top: 1px solid ${colors.border};">
                <div style="color: ${colors.text}; font-size: 15px; margin-bottom: 8px; font-weight: 600;">
                    ${currentStamps} из ${maxStamps} штампов в текущем наборе
                </div>
                ${currentStamps >= 5 && currentStamps < 10 ? `
                    <div style="color: #FF9800; font-weight: 600; font-size: 14px; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        ${getSuccessIcon('#FF9800')}
                        <span>Бонус за 5 штампов получен!</span>
                    </div>
                ` : ''}
                ${currentStamps >= maxStamps ? `
                    <div style="color: #4CAF50; font-weight: 600; font-size: 16px; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        ${getSuccessIcon('#4CAF50')}
                        <span>Текущий набор завершен!</span>
                    </div>
                    <div style="color: ${colors.textSecondary}; font-size: 13px; margin-top: 6px;">
                        Начнется новый набор при следующем заказе
                    </div>
                ` : `
                    <div style="color: ${colors.textSecondary}; font-size: 13px; margin-top: 6px;">
                        Осталось собрать: ${maxStamps - currentStamps} ${maxStamps - currentStamps === 1 ? 'штамп' : 'штампов'}
                    </div>
                `}
            </div>
        </div>
    `;
    
    // Анимация появления контейнера - плавное открытие
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            
            // Анимация появления штампов - плавная последовательная анимация
            setTimeout(() => {
                for (let i = 0; i < maxStamps; i++) {
                    const stampElement = container.querySelector(`.stamp-coin-${i}`);
                    if (stampElement) {
                        setTimeout(() => {
                            stampElement.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out';
                            stampElement.style.transform = 'scale(1)';
                            stampElement.style.opacity = '1';
                        }, i * 30 + 200); // Начинаем через 200ms после появления контейнера, с задержкой 30ms между штампами
                    }
                }
            }, 200);
        });
    });
}

// Показать избранное
function showFavorites() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    // Сохраняем текущую позицию скролла перед обновлением (только если мы не переходим из товара)
    const savedScrollPosition = (currentPage !== 'product' && favoritesScrollPosition > 0) ? favoritesScrollPosition : 0;
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    // Загружаем сохраненную категорию
    const savedCategory = localStorage.getItem('favoritesCategory');
    if (savedCategory) {
        favoritesCategory = savedCategory;
    }
    
    // Фильтруем избранное - теперь учитываем вкусы и крепость
    let favoriteItems = favorites.filter(fav => {
        if (typeof fav === 'number' || typeof fav === 'string') {
            return products.some(p => p.id == fav);
        } else {
            return products.some(p => p.id == fav.productId);
        }
    });
    
    // Фильтруем по категории, если выбрана не "все"
    if (favoritesCategory !== 'all') {
        favoriteItems = favoriteItems.filter(fav => {
            const productId = typeof fav === 'number' || typeof fav === 'string' ? fav : fav.productId;
            const product = products.find(p => p.id == productId);
            if (!product) return false;
            
            // Маппинг категорий
            const categoryMap = {
                'liquids': 'liquids',
                'accessories': 'accessories',
                'disposable': 'disposable',
                'vape': 'vape' // или 'devices' в зависимости от структуры
            };
            
            // Проверяем соответствие категории
            if (favoritesCategory === 'vape') {
                // Для категории "Вейп" проверяем несколько вариантов
                return product.category === 'vape' || product.category === 'devices' || 
                       (product.name && product.name.toLowerCase().includes('вейп')) ||
                       (product.description && product.description.toLowerCase().includes('вейп'));
            }
            
            return product.category === categoryMap[favoritesCategory];
        });
    }
    
    // Обновляем активные кнопки вкладок (используем статические из HTML)
    // Это делается в setFavoritesCategory, не дублируем здесь
    
    if (favoriteItems.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: ${colors.textSecondary};">
                <div style="width: 120px; height: 120px; border: 3px solid ${colors.border}; border-radius: 50%; 
                    margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; 
                    background: ${colors.bgCard};">
                    ${getHeartEmptyIcon('#999999')}
                </div>
                <h3 style="color: ${colors.text}; margin-bottom: 10px; font-size: 20px; font-weight: 700;">
                    ${favoritesCategory === 'all' ? 'Нет избранных товаров' : 'Нет товаров в этой категории'}
                </h3>
                <p style="font-size: 14px; color: ${colors.textSecondary};">
                    ${favoritesCategory === 'all' ? 'Добавьте товары в избранное, нажав на сердечко' : 'Попробуйте выбрать другую категорию'}
                </p>
            </div>
        `;
        setTimeout(() => {
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        }, 10);
        return;
    }
    
    // Сортируем избранное - сначала товары в наличии, потом не в наличии
    favoriteItems = favoriteItems.sort((a, b) => {
        const aProductId = typeof a === 'number' || typeof a === 'string' ? a : a.productId;
        const bProductId = typeof b === 'number' || typeof b === 'string' ? b : b.productId;
        const aProduct = products.find(p => p.id == aProductId);
        const bProduct = products.find(p => p.id == bProductId);
        
        if (!aProduct || !bProduct) return 0;
        
        const aFlavor = typeof a === 'object' ? a.flavor : null;
        const bFlavor = typeof b === 'object' ? b.flavor : null;
        
        let aInStock = true;
        let bInStock = true;
        
        if (deliveryType === 'selfPickup' && selectedPickupLocation) {
            if (aFlavor) {
                aInStock = isFlavorInStockAtLocation(aProduct, aFlavor, selectedPickupLocation);
            } else {
                aInStock = isProductInStockAtLocation(aProduct, selectedPickupLocation);
            }
            if (bFlavor) {
                bInStock = isFlavorInStockAtLocation(bProduct, bFlavor, selectedPickupLocation);
            } else {
                bInStock = isProductInStockAtLocation(bProduct, selectedPickupLocation);
            }
        } else {
            aInStock = aProduct.inStock !== false && (aProduct.quantity === undefined || aProduct.quantity > 0);
            bInStock = bProduct.inStock !== false && (bProduct.quantity === undefined || bProduct.quantity > 0);
        }
        
        // Сначала товары в наличии (true идет перед false)
        if (aInStock !== bInStock) {
            return bInStock ? 1 : -1;
        }
        return 0;
    });
    
    // Создаем контейнер с сеткой 2 колонки
    container.innerHTML = `
        <div id="favorites-grid-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; will-change: contents;">
            ${favoriteItems.map((fav, index) => {
        const productId = typeof fav === 'number' || typeof fav === 'string' ? fav : fav.productId;
        const flavor = typeof fav === 'object' ? fav.flavor : null;
        const strength = typeof fav === 'object' ? fav.strength : null;
        const product = products.find(p => p.id == productId);
        if (!product) return '';
        
        // Определяем правильное изображение для вкуса
        let imageUrl = product.imageUrl;
        if (flavor && product.flavorImages && product.flavorImages[flavor]) {
            imageUrl = product.flavorImages[flavor];
        }
        
        // Проверяем наличие товара на выбранной точке
        let isInStock = true;
        if (deliveryType === 'selfPickup' && selectedPickupLocation) {
            // Проверяем наличие конкретного вкуса если он указан
            if (flavor) {
                isInStock = isFlavorInStockAtLocation(product, flavor, selectedPickupLocation);
            } else {
                isInStock = isProductInStockAtLocation(product, selectedPickupLocation);
            }
        } else {
            isInStock = product.inStock !== false && (product.quantity === undefined || product.quantity > 0);
        }
        
        // Правильно экранируем кавычки в URL для изображения
        const safeImageUrl = imageUrl ? imageUrl.replace(/'/g, "&#39;").replace(/"/g, "&quot;") : '';
        
        // Показываем фото всегда, но делаем серым если нет в наличии
        const imageContent = imageUrl
            ? `<img src="${safeImageUrl}" alt="${product.name.replace(/'/g, "&#39;")}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; ${!isInStock ? 'opacity: 0.5; filter: grayscale(100%);' : ''}" onerror="this.parentElement.innerHTML='${getPackageIcon('#999999')}'">`
            : getPackageIcon('#999999');
        
        // Формируем параметры для передачи в showProduct - правильно экранируем
        const flavorParam = flavor ? `'${String(flavor).replace(/'/g, "\\'").replace(/\\/g, "\\\\")}'` : 'null';
        const strengthParam = strength ? `'${String(strength).replace(/'/g, "\\'").replace(/\\/g, "\\\\")}'` : 'null';
        
        return `
            <div data-favorite-id="${productId}" data-favorite-flavor="${flavor || ''}" data-favorite-strength="${strength || ''}" onclick="showProduct(${productId}, ${flavorParam}, ${strengthParam})" style="background: ${colors.bgCard}; padding: 12px; border-radius: 16px; 
                border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); 
                position: relative; transform: translateY(20px); opacity: 0; cursor: pointer;
                transition: transform 0.4s ease ${index * 0.05}s, opacity 0.4s ease ${index * 0.05}s, box-shadow 0.2s ease, margin 0.35s cubic-bezier(0.4, 0, 0.2, 1), padding 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex; flex-direction: column; height: 100%; ${!isInStock ? 'opacity: 0.5;' : ''}"
                onmouseover="this.style.boxShadow='0 6px 16px rgba(0,0,0,${darkMode ? '0.4' : '0.12'})'"
                onmouseout="this.style.boxShadow='0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'})'">
                <div style="position: relative; width: 100%; aspect-ratio: 1; background: ${colors.bgSecondary}; border-radius: 12px; 
                    overflow: hidden; margin-bottom: 12px; flex-shrink: 0;">
                        ${imageContent}
                    <button id="favorite-heart-btn-${productId}-${flavor || ''}-${strength || ''}" onclick="event.stopPropagation(); animateHeartRemoval(${productId}, '${flavor || ''}', '${strength || ''}')" 
                        style="position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; 
                        border: none; background: rgba(255, 255, 255, 0.95); cursor: pointer; 
                        border-radius: 50%; display: flex; align-items: center; justify-content: center;
                        transition: all 0.2s; z-index: 10; padding: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15); filter: none !important;"
                        onmouseover="this.style.transform='scale(1.1)'; this.style.background='rgba(255, 255, 255, 1)'"
                        onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(255, 255, 255, 0.95)'">
                        <span id="favorite-heart-icon-${productId}-${flavor || ''}-${strength || ''}" style="display: flex; align-items: center; justify-content: center; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); filter: none !important;">
                            ${getHeartFilledIcon('#ff4444')}
                        </span>
                    </button>
                    ${isInStock ? `
                    <button onclick="event.stopPropagation(); addToCartFromFavorites(${productId}, '${flavor || ''}', '${strength || ''}')" 
                        style="position: absolute; bottom: 8px; right: 8px; width: 36px; height: 36px; 
                        border: none; background: rgba(0, 122, 255, 0.95); cursor: pointer; 
                        border-radius: 50%; display: flex; align-items: center; justify-content: center;
                        transition: all 0.2s; z-index: 10; padding: 0; box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);"
                        onmouseover="this.style.transform='scale(1.1)'; this.style.background='rgba(0, 122, 255, 1)'; this.style.boxShadow='0 4px 12px rgba(0, 122, 255, 0.4)'"
                        onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(0, 122, 255, 0.95)'; this.style.boxShadow='0 2px 8px rgba(0, 122, 255, 0.3)'">
                        <span style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;">
                            ${getCartIcon('#ffffff')}
                        </span>
                    </button>
                    ` : ''}
                    </div>
                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                    <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px; color: ${isInStock ? colors.text : '#999'}; 
                        word-wrap: break-word; overflow-wrap: break-word; 
                        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; 
                        overflow: hidden; text-overflow: ellipsis; line-height: 1.3; min-height: 2.6em;">
                        ${product.name}
                    </div>
                    ${!isInStock ? `
                        <div style="color: #f44336; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                            На данном адресе этого товара нет
                        </div>
                        ${(() => {
                            let locationsWithStock = [];
                            if (flavor) {
                                // Проверяем наличие конкретного вкуса
                                const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                                locationsWithStock = getLocationsWithFlavorStockByCity(product, flavor, selectedCity);
                            } else {
                                locationsWithStock = getLocationsWithStock(product);
                                // Фильтруем по городу если выбран город
                                const selectedCity = selectedPickupLocation ? getCityFromLocation(selectedPickupLocation) : null;
                                if (selectedCity) {
                                    locationsWithStock = locationsWithStock.filter(location => {
                                        if (selectedCity === 'Минск') {
                                            return location.includes('Минск');
                                        } else if (selectedCity === 'Могилёв' || selectedCity === 'Могилев') {
                                            return location.includes('Могилёв') || location.includes('Могилев');
                                        }
                                        return true;
                                    });
                                }
                            }
                            if (locationsWithStock.length > 0) {
                                return `<div style="color: #666; font-size: 11px; margin-bottom: 8px; line-height: 1.4;">
                                    Есть в наличии на: ${locationsWithStock.join(', ')}
                                </div>`;
                            }
                            return '';
                        })()}
                    ` : ''}
                    <div style="margin-top: auto; display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                        ${flavor ? `
                            <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); padding: 3px 6px; border-radius: 6px; 
                                display: inline-flex; align-items: center; gap: 3px; 
                                font-size: 10px; color: #d32f2f; font-weight: 600; white-space: nowrap;">
                                <span style="width: 10px; height: 10px; display: flex; align-items: center; justify-content: center;">${getCandyIcon('#d32f2f')}</span>
                                <span>${flavor}</span>
                            </div>
                        ` : ''}
                        ${strength ? `
                            <div style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 3px 6px; border-radius: 6px; 
                                display: inline-flex; align-items: center; gap: 3px; 
                                font-size: 10px; color: #1976d2; font-weight: 600; white-space: nowrap;">
                                <span style="width: 10px; height: 10px; display: flex; align-items: center; justify-content: center;">${getLightningIcon('#1976d2')}</span>
                                <span>${strength}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div style="font-size: 18px; font-weight: 700; color: ${isInStock ? '#007AFF' : '#999'}; margin-top: auto;">
                            ${product.price.toFixed(2)} BYN
                        </div>
                    </div>
                </div>
        `;
            }).join('')}
            </div>
        `;
    
    // Плавное появление контейнера
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
    
            // Анимация появления карточек с плавным переходом
    setTimeout(() => {
        const cards = container.querySelectorAll('[style*="transform: translateY(20px)"]');
        cards.forEach((card, idx) => {
                    card.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease';
            setTimeout(() => {
                card.style.transform = 'translateY(0)';
                card.style.opacity = '1';
            }, idx * 50);
        });
            }, 100);
        });
    });
    
}

// Установить категорию в избранном
function setFavoritesCategory(category) {
    // Если категория уже выбрана, не делаем ничего
    if (favoritesCategory === category) {
        return;
    }
    
    favoritesCategory = category;
    localStorage.setItem('favoritesCategory', favoritesCategory);
    
    // Обновляем активные кнопки вкладок (как в ассортименте - используем классы)
    document.querySelectorAll('#favorites-tabs-section .category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`favorites-tab-${category}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Просто перерисовываем избранное (как displayProducts в ассортименте)
    showFavorites();
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Анимация удаления сердечка из избранного
function animateHeartRemoval(productId, flavor, strength) {
    const flavorValue = flavor && flavor !== 'null' && flavor !== '' ? flavor : null;
    const strengthValue = strength && strength !== 'null' && strength !== '' ? strength : null;
    
    const heartIconId = `favorite-heart-icon-${productId}-${flavor || ''}-${strength || ''}`;
    const heartIcon = document.getElementById(heartIconId);
    
    if (heartIcon) {
        // Анимация удаления сердечка
        heartIcon.style.transform = 'scale(0.8) rotate(-12deg)';
        heartIcon.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
        
        setTimeout(() => {
            heartIcon.innerHTML = getHeartEmptyIcon('#999999');
            heartIcon.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            heartIcon.style.transform = 'scale(1.2) rotate(12deg)';
            
            setTimeout(() => {
                heartIcon.style.transform = 'scale(1.1) rotate(-8deg)';
                
                setTimeout(() => {
                    heartIcon.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    heartIcon.style.transform = 'scale(1) rotate(0deg)';
                    
                    // После завершения анимации удаляем товар
                    setTimeout(() => {
                        removeFromFavorites(productId, flavor, strength);
                    }, 300);
                }, 150);
            }, 150);
        }, 150);
    } else {
        // Если иконка не найдена, удаляем сразу
        removeFromFavorites(productId, flavor, strength);
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Удалить из избранного
function removeFromFavorites(productId, flavor, strength) {
    const flavorValue = flavor && flavor !== 'null' && flavor !== '' ? flavor : null;
    const strengthValue = strength && strength !== 'null' && strength !== '' ? strength : null;
    
    const index = favorites.findIndex(fav => {
        if (typeof fav === 'number' || typeof fav === 'string') {
            return fav == productId && !flavorValue && !strengthValue;
        } else {
            return fav.productId == productId && 
                   fav.flavor === flavorValue && 
                   fav.strength === strengthValue;
        }
    });
    
    if (index > -1) {
        // Находим элемент на странице для плавной анимации удаления
        const container = document.getElementById('page-content');
        if (container && currentPage === 'favorites') {
            const cards = container.querySelectorAll('[data-favorite-id]');
            let targetCard = null;
            
            // Ищем точное совпадение - учитываем flavor и strength
            cards.forEach(card => {
                const cardProductId = parseInt(card.getAttribute('data-favorite-id'));
                const cardFlavor = card.getAttribute('data-favorite-flavor');
                const cardStrength = card.getAttribute('data-favorite-strength');
                
                const cardFlavorValue = (cardFlavor && cardFlavor !== 'null' && cardFlavor !== '') ? cardFlavor : null;
                const cardStrengthValue = (cardStrength && cardStrength !== 'null' && cardStrength !== '') ? cardStrength : null;
                
                if (cardProductId === productId && 
                    cardFlavorValue === flavorValue && 
                    cardStrengthValue === strengthValue) {
                    targetCard = card;
                }
            });
            
            // Плавная анимация удаления с плавной заменой
            if (targetCard) {
                // Сохраняем все остальные карточки для плавной анимации
                const allCards = Array.from(cards);
                const targetIndex = allCards.indexOf(targetCard);
                
                // Удаляем из массива сразу
                favorites.splice(index, 1);
                localStorage.setItem('favorites', JSON.stringify(favorites));
                
                // Получаем контейнер с grid
                const gridContainer = targetCard.closest('#favorites-grid-container') || targetCard.closest('div[style*="grid-template-columns"]');
                
                // Анимация удаления с плавным переходом
                targetCard.style.willChange = 'transform, opacity, height, margin, padding';
                targetCard.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                
                // Сохраняем размеры для плавной анимации
                const originalHeight = targetCard.offsetHeight;
                const originalPaddingTop = window.getComputedStyle(targetCard).paddingTop;
                const originalPaddingBottom = window.getComputedStyle(targetCard).paddingBottom;
                
                // Начинаем анимацию удаления
                targetCard.style.opacity = '0';
                targetCard.style.transform = 'scale(0.85)';
                targetCard.style.height = originalHeight + 'px';
                targetCard.style.overflow = 'hidden';
                
                // Плавно уменьшаем высоту, padding и margin
                requestAnimationFrame(() => {
                    targetCard.style.height = '0';
                    targetCard.style.paddingTop = '0';
                    targetCard.style.paddingBottom = '0';
                    targetCard.style.marginBottom = '0';
                    
                    // Остальные карточки автоматически займут место благодаря CSS grid
                    // Нам нужно только подождать, пока анимация завершится
                    setTimeout(() => {
                        // Удаляем элемент из DOM после завершения анимации
                        targetCard.remove();
                        
                        // Убираем will-change
                        targetCard.style.willChange = '';
                        
                        // Проверяем, остались ли товары
                        const remainingCards = container.querySelectorAll('[data-favorite-id]');
                        if (remainingCards.length === 0) {
                            // Если список пустой, показываем пустое состояние
                            showFavorites();
                        }
                        
                        showToast('Товар удален из избранного', 'info', 2000);
                    }, 350);
                });
            } else {
                // Если элемент не найден, просто обновляем
                favorites.splice(index, 1);
                localStorage.setItem('favorites', JSON.stringify(favorites));
                showToast('Товар удален из избранного', 'info', 2000);
                showFavorites();
            }
        } else {
            // Если мы не на странице избранного, просто удаляем из массива
            favorites.splice(index, 1);
            localStorage.setItem('favorites', JSON.stringify(favorites));
            showToast('Товар удален из избранного', 'info', 2000);
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// Показать профиль
function showProfile() {
    const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    container.innerHTML = `
        <div style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; margin-bottom: 12px; color: ${colors.text};">
            <div style="display: flex; gap: 16px; align-items: center;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: #9C27B0; 
                    display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
                    ${getUserIcon('#ffffff')}
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px; color: ${colors.text};">
                        @${user?.username || 'user'}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; color: ${colors.textSecondary}; font-size: 14px;">
                        <span>ID: ${user?.id || 'N/A'}</span>
                        <button onclick="copyId('${user?.id || ''}')" style="width: 20px; height: 20px; 
                            border: none; background: none; cursor: pointer; color: ${colors.textSecondary}; 
                            display: flex; align-items: center; justify-content: center;">${getCopyIcon(colors.textSecondary)}</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 12px;">
            <div onclick="showPage('orders')" style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; text-align: center; cursor: pointer; color: ${colors.text};">
                <div style="width: 40px; height: 40px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getCartIcon('#007AFF')}</div>
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text};">Заказы</div>
                <div style="padding: 4px 12px; background: #4CAF50; color: white; 
                    border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block;">
                    ${orders.length}
                </div>
            </div>
            
            <div onclick="showPage('vapeCoins')" style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; text-align: center; cursor: pointer; color: ${colors.text};">
                <div style="width: 40px; height: 40px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800')}</div>
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text};">Vape Coins</div>
                <div style="padding: 4px 12px; background: #FF9800; color: white; 
                    border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block;">
                    ${vapeCoins.toFixed(1)}
                </div>
            </div>
            
            <div onclick="showPage('referrals')" style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; text-align: center; cursor: pointer; color: ${colors.text};">
                <div style="width: 40px; height: 40px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getUsersIcon('#007AFF')}</div>
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text};">Рефералы</div>
                <div style="padding: 4px 12px; background: #007AFF; color: white; 
                    border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block;">
                    ${referralsData.total || 0} • ${getReferralPercentage(referralsData.total || 0)}%
                </div>
            </div>
            
            <div onclick="showPage('settings')" style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; text-align: center; cursor: pointer; color: ${colors.text};">
                <div style="width: 40px; height: 40px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getSettingsIcon(colors.text)}</div>
                <div style="font-weight: 600; color: ${colors.text};">Настройки</div>
            </div>
            
            <div onclick="showPage('help')" style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; text-align: center; cursor: pointer; color: ${colors.text};">
                <div style="width: 40px; height: 40px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getQuestionIcon('#007AFF')}</div>
                <div style="font-weight: 600; margin-bottom: 8px; color: ${colors.text};">Помощь</div>
                <div style="padding: 4px 12px; background: #007AFF; color: white; 
                    border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block;">
                    FAQ
                </div>
            </div>
        </div>
        
        <div style="background: ${colors.bgCard}; padding: 16px; border-radius: 12px; color: ${colors.text};">
            <div style="font-weight: 600; margin-bottom: 12px; color: ${colors.text};">Недавно просмотренные</div>
            ${viewedProducts.length > 0 ? `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                    ${viewedProducts.slice(0, 6).map(id => {
                        const product = products.find(p => p.id === id);
                        if (!product) return '';
                        return `
                            <div onclick="showProduct(${id})" style="cursor: pointer; padding: 12px; border: 1px solid ${colors.border}; border-radius: 8px; background: ${colors.bgCard};">
                                <div style="text-align: center; font-size: ${product.imageUrl ? '0' : '40px'}; margin-bottom: 8px; width: 100%; height: 60px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                    ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" onerror="this.parentElement.innerHTML='${product.image || product.emoji}'; this.parentElement.style.fontSize='40px';">` : (product.image || product.emoji)}
                                </div>
                                <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px; color: ${colors.text};">${product.name}</div>
                                <div style="font-size: 14px; color: #007AFF; font-weight: 700;">${product.price.toFixed(2)} BYN</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `<div style="color: ${colors.textSecondary}; font-size: 14px;">Пока нет просмотренных товаров</div>`}
        </div>
        
        <div style="background: ${colors.bgCard}; padding: 16px; border-radius: 12px; margin-top: 12px; text-align: center;">
            <button onclick="showDebugInfo()" style="width: 100%; padding: 12px; background: #007AFF; color: white; 
                border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                🔍 Проверить синхронизацию
            </button>
        </div>
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Флаг для предотвращения бесконечных циклов обновления
let isUpdatingOrders = false;

// Показать заказы
function showOrders() {
    // ВАЖНО: Предотвращаем бесконечные циклы обновления
    if (isUpdatingOrders) {
        console.log('⚠️ showOrders уже выполняется, пропускаем');
        return;
    }
    
    const container = document.getElementById('page-content');
    if (!container) return;
    
    isUpdatingOrders = true;
    
    // Загружаем заказы из localStorage перед отображением
    const savedOrders = localStorage.getItem('orders');
    if (savedOrders) {
        try {
            const parsedOrders = JSON.parse(savedOrders);
            if (Array.isArray(parsedOrders)) {
                orders = parsedOrders;
            }
        } catch (e) {
            console.error('Error loading orders from localStorage:', e);
        }
    }
    
    // ВАЖНО: Проверяем статус заказов БЕЗ автоматического вызова showOrders() снова
    // Это предотвращает бесконечные циклы
    // ВАЖНО: НЕ запускаем проверку для уже переданных заказов, чтобы не начислять коины/штампы повторно
    orders.forEach(order => {
        if (order.id && (order.status === 'pending' || order.status === 'processing' || order.status === 'confirmed')) {
            // Запускаем проверку статуса, если еще не запущена
            if (!orderStatusCheckIntervals[order.id]) {
                checkOrderStatus(order.id);
            }
        } else if (order.id && order.status === 'transferred') {
            // ВАЖНО: Для переданных заказов проверяем, что коины/штампы начислены
            // Если нет - начисляем один раз (для синхронизации между устройствами)
            const coinsAlreadyAdded = localStorage.getItem(`coins_added_${order.id}`);
            const stampsAlreadyAdded = localStorage.getItem(`stamps_added_${order.id}`);
            
            // Если коины или штампы не начислены, запускаем проверку один раз
            if (!coinsAlreadyAdded || !stampsAlreadyAdded) {
                if (!orderStatusCheckIntervals[order.id]) {
                    checkOrderStatus(order.id);
                }
            }
        }
    });
    
    const colors = getThemeColors();
    
    // ВАЖНО: Сбрасываем флаг после завершения отрисовки
    setTimeout(() => {
        isUpdatingOrders = false;
    }, 100);
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Сортируем заказы: активные выше, отклоненные/отмененные ниже
    const filteredOrders = [...orders].sort((a, b) => {
        // Определяем приоритет статуса (меньше = выше в списке)
        // Порядок: активные (0) -> переданные (1) -> отмененные (2)
        const getStatusPriority = (status) => {
            if (status === 'pending' || status === 'processing' || status === 'confirmed') {
                return 0; // Активные заказы - приоритет 0 (самые верхние)
            }
            if (status === 'transferred') {
                return 1; // Переданные - приоритет 1 (посередине)
            }
            if (status === 'rejected' || status === 'cancelled') {
                return 2; // Отмененные - приоритет 2 (внизу)
            }
            return 3; // Неизвестные статусы - в самом низу
        };
        
        const priorityA = getStatusPriority(a.status);
        const priorityB = getStatusPriority(b.status);
        
        // Сначала по приоритету статуса
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // Если приоритет одинаковый, сортируем по дате создания (новые сверху)
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(a.date);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(b.date);
        return dateB - dateA;
    });
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: ${colors.textSecondary};">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#999999')}</div>
                <h3 style="color: ${colors.text}; margin-bottom: 10px; font-size: 20px;">Нет заказов</h3>
                <p style="color: ${colors.textSecondary};">Вы еще не делали заказов</p>
            </div>
        `;
        setTimeout(() => {
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        }, 10);
        return;
    }
    
    container.innerHTML = `
        <!-- Заголовок -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="font-size: 18px; font-weight: 700; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#007AFF')}</span>
                <span style="font-size: 18px; font-weight: 700;">Мои заказы</span>
                ${filteredOrders.length > 0 ? `<span style="font-size: 14px; font-weight: 500; color: ${colors.textSecondary};">(${filteredOrders.length})</span>` : ''}
            </div>
        </div>
        
        <!-- Список заказов -->
        ${filteredOrders.length === 0 ? `
            <div style="text-align: center; padding: 60px 20px; color: ${colors.textSecondary};">
                <div style="width: 120px; height: 120px; border: 3px solid ${colors.border}; border-radius: 50%; 
                    margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; 
                    background: ${colors.bgCard};">
                    ${getPackageIcon('#999999')}
                </div>
                <h3 style="color: ${colors.text}; margin-bottom: 10px; font-size: 20px; font-weight: 700;">Нет заказов</h3>
                <div style="font-size: 14px; color: ${colors.textSecondary};">Ваши заказы появятся здесь</div>
            </div>
        ` : filteredOrders.map((order, index) => {
        // Форматируем дату заказа с учетом московского времени
        let formattedDate = '';
        if (order.selectedDeliveryDay) {
            // Если есть выбранная дата доставки - всегда показываем дату, а не слово "завтра"
            const deliveryDate = new Date(order.selectedDeliveryDay + 'T12:00:00');
            formattedDate = deliveryDate.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } else {
            // Используем дату заказа с московским временем
        const orderDate = new Date(order.date);
            const moscowOffset = 3 * 60 * 60 * 1000;
            const moscowDate = new Date(orderDate.getTime() + moscowOffset);
            formattedDate = moscowDate.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
                year: 'numeric'
            });
        }
        
        // Форматируем время доставки
        let timeDisplay = '';
        if (order.deliveryTime) {
            timeDisplay = order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime;
            // Точное время показываем только для самовывоза
            if (order.deliveryExactTime && (order.deliveryType === 'selfPickup' || !order.deliveryType)) {
                timeDisplay += ` (${order.deliveryExactTime})`;
            }
        }
        
        const statusText = order.status === 'pending' ? 'В обработке' :
                          order.status === 'processing' ? 'В обработке' : 
                          order.status === 'confirmed' ? 'Заказ принят' :
                          order.status === 'transferred' ? 'Заказ передан' :
                          order.status === 'rejected' ? 'Заказ отклонен' :
                          order.status === 'cancelled' ? 'Заказ отменен' : 
                          order.status === 'received' ? 'Заказ получен' : 'Неизвестно';
        const statusColor = order.status === 'pending' ? '#FF9800' :
                          order.status === 'processing' ? '#FF9800' : 
                          order.status === 'confirmed' ? '#4CAF50' :
                          order.status === 'transferred' ? '#2196F3' :
                          order.status === 'rejected' ? '#f44336' :
                          order.status === 'cancelled' ? '#999' : '#4CAF50';
        const statusBg = order.status === 'pending' ? 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)' :
                        order.status === 'processing' ? 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)' : 
                        order.status === 'confirmed' ? 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)' :
                        order.status === 'transferred' ? 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)' :
                        order.status === 'rejected' ? 'linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)' :
                        order.status === 'cancelled' ? 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)' : 
                        'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)';
        const statusIcon = order.status === 'pending' ? getClockIcon('#ffffff') :
                          order.status === 'processing' ? getClockIcon('#ffffff') : 
                          order.status === 'confirmed' ? getSuccessIcon('#ffffff') :
                          order.status === 'transferred' ? getPackageIcon('#ffffff') :
                          order.status === 'rejected' ? getCrossIcon('#ffffff') :
                          order.status === 'cancelled' ? getCrossIcon('#ffffff') : getSuccessIcon('#ffffff');
        const totalAmount = order.vapeCoinsSpent && order.vapeCoinsSpent > 0 
            ? `${order.vapeCoinsSpent.toFixed(1)}` 
            : `${order.total.toFixed(2)} BYN`;
        
        return `
            <div style="background: ${darkMode ? 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)'}; padding: 20px; border-radius: 16px; margin-bottom: 16px; 
                border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); color: ${colors.text};">
                <!-- Заголовок заказа -->
                <div style="background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); padding: 16px; border-radius: 12px; margin-bottom: 16px; color: white; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 700; font-size: 18px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                                <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#ffffff').replace('width="24" height="24"', 'width="20" height="20"')}</span>
                                <span>Заказ #${order.id.slice(-6)}</span>
                            </div>
                            <div style="font-size: 12px; opacity: 0.9; display: flex; align-items: center; gap: 4px; margin-top: 4px; flex-direction: column; align-items: flex-start;">
                                <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#ffffff').replace('width="24" height="24"', 'width="14" height="14"')}</span>
                                    <span>${formattedDate}${timeDisplay ? ` • ${timeDisplay}` : ''}</span>
                                </div>
                                ${(() => {
                                    // Показываем время создания заказа в московском времени
                                    let timeCreated = '';
                                    if (order.createdAt) {
                                        // Используем сохраненное время создания заказа
                                        // createdAt создается через: getMoscowTime().toISOString()
                                        // getMoscowTime() делает: new Date(now.getTime() + 3 часа)
                                        // Это создает Date объект, который в UTC показывает время на 3 часа больше текущего UTC
                                        // Например: если сейчас UTC 12:00 (15:00 по Москве), getMoscowTime() вернет Date с UTC 15:00
                                        // createdAt.toISOString() вернет строку с UTC 15:00
                                        // Когда мы делаем new Date(order.createdAt), получаем Date с UTC 15:00
                                        // Но это неправильно! Нужно использовать локальное время браузера
                                        // Правильный способ: использовать локальное время браузера напрямую
                                        const createdDate = new Date(order.createdAt);
                                        // createdAt содержит UTC время, которое на 3 часа больше реального UTC
                                        // Чтобы получить правильное московское время, нужно вычесть 3 часа
                                        const moscowOffset = 3 * 60 * 60 * 1000;
                                        const correctTime = new Date(createdDate.getTime() - moscowOffset);
                                        // Используем локальное время браузера
                                        const hours = String(correctTime.getHours()).padStart(2, '0');
                                        const minutes = String(correctTime.getMinutes()).padStart(2, '0');
                                        timeCreated = `${hours}:${minutes}`;
                                    } else {
                                        // Fallback: используем текущее московское время
                                        const now = new Date();
                                        const hours = String(now.getHours()).padStart(2, '0');
                                        const minutes = String(now.getMinutes()).padStart(2, '0');
                                        timeCreated = `${hours}:${minutes}`;
                                    }
                                    return `<div style="font-size: 11px; opacity: 0.7; margin-top: 4px; margin-left: 18px;">Создан: ${timeCreated}</div>`;
                                })()}
                            </div>
                        </div>
                        <div style="padding: 8px 14px; background: rgba(255,255,255,0.2); border-radius: 10px; font-size: 13px; font-weight: 600; 
                            display: flex; align-items: center; gap: 6px;">
                            <span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">${statusIcon.replace('width="24" height="24"', 'width="16" height="16"')}</span>
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Товары -->
                <div style="background: ${darkMode ? colors.bgSecondary : '#f8f9fa'}; padding: 16px; border-radius: 12px; margin-bottom: 16px; border: 1px solid ${colors.border};">
                    <div style="font-weight: 600; font-size: 14px; color: ${colors.textSecondary}; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#666666').replace('width="24" height="24"', 'width="20" height="20"')}</span>
                        <span>Товары (${order.items.reduce((sum, item) => sum + item.quantity, 0)} шт.)</span>
                    </div>
                    ${order.items.map((item, itemIdx) => `
                        <div style="background: ${colors.bgCard}; padding: 12px; border-radius: 10px; margin-bottom: 8px; 
                            border: 1px solid ${colors.border}; display: flex; gap: 12px;">
                            <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #f8f8f8 0%, #f0f0f0 100%); 
                                border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                                ${item.imageUrl ? `<img id="order-img-${order.id}-${itemIdx}" src="${item.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;" onerror="handleImageError('order-img-${order.id}-${itemIdx}')">` : getPackageIcon('#999')}
                            </div>
                            <div style="flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word;">
                                <div style="font-weight: 600; font-size: 15px; margin-bottom: 6px; color: ${colors.text}; word-wrap: break-word; overflow-wrap: break-word;">${item.name}</div>
                                ${item.flavor ? `
                                    <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); padding: 4px 8px; border-radius: 6px; 
                                        display: inline-flex; align-items: center; gap: 4px; margin-bottom: 4px; margin-right: 6px; font-size: 11px; color: #d32f2f; font-weight: 600;">
                                        <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${getCandyIcon('#d32f2f')}</span>
                                        <span>${item.flavor}</span>
                                    </div>
                                ` : ''}
                                ${item.strength ? `
                                    <div style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 4px 8px; border-radius: 6px; 
                                        display: inline-flex; align-items: center; gap: 4px; margin-bottom: 4px; font-size: 11px; color: #1976d2; font-weight: 600;">
                                        <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${getLightningIcon('#1976d2')}</span>
                                        <span>${item.strength}</span>
                                    </div>
                                ` : ''}
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; flex-wrap: wrap; gap: 4px;">
                                    <span style="font-size: 12px; color: ${colors.textSecondary};">Количество: ${item.quantity}</span>
                                    <span style="font-weight: 700; font-size: 15px; color: #007AFF;">
                                        ${item.paymentMethod === 'coins' && item.vapeCoinsPrice ? 
                                            `${(item.vapeCoinsPrice * item.quantity).toFixed(1)}` : 
                                            `${(item.price * item.quantity).toFixed(2)} BYN`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Информация о заказе -->
                    ${order.vapeCoinsSpent && order.vapeCoinsSpent > 0 ? `
                <div style="background: ${darkMode ? colors.bgSecondary : '#f8f9fa'}; padding: 16px; border-radius: 12px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%); 
                                border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                            ${getCoinIcon('#FF9800', 24)}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 12px; color: ${colors.textSecondary}; margin-bottom: 4px;">Оплачено Vape Coins</div>
                            <div style="font-size: 15px; font-weight: 600; color: #FF9800;">
                                ${order.vapeCoinsSpent.toFixed(1)}
                            </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                <!-- Самовывоз/Доставка и Итого в синей рамке -->
                <div style="background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); padding: 16px; border-radius: 12px; margin-bottom: 16px; color: white; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                        ${order.deliveryType || order.location ? `
                            <div style="flex: 1;">
                                <div style="font-size: 11px; opacity: 0.8; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${(order.deliveryType === 'delivery' ? getPackageIcon('#ffffff') : getLocationIcon('#ffffff')).replace('width="24" height="24"', 'width="12" height="12"')}</span>
                                    <span>${order.deliveryType === 'delivery' ? 'Доставка' : 'Самовывоз'}</span>
                        </div>
                                <div style="font-size: 13px; font-weight: 600; opacity: 0.95; word-wrap: break-word; overflow-wrap: break-word;">
                                    ${order.deliveryType === 'selfPickup' ? (order.pickupLocation || 'Не указано') : (order.deliveryAddress || 'Не указано')}
                            </div>
                            ${order.selectedDeliveryDay ? (() => {
                                // Всегда показываем дату, а не слово "завтра"
                                const deliveryDate = new Date(order.selectedDeliveryDay + 'T12:00:00');
                                const dateText = deliveryDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                return `
                                <div style="font-size: 11px; opacity: 0.8; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#ffffff').replace('width="24" height="24"', 'width="12" height="12"')}</span>
                                        <span>${dateText}${order.deliveryTime ? `, ${typeof order.deliveryTime === 'string' && order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime}${order.deliveryExactTime && (order.deliveryType === 'selfPickup' || !order.deliveryType) ? ` (${order.deliveryExactTime})` : ''}` : ''}</span>
                                    </div>
                                `;
                            })() : order.deliveryTime ? `
                                <div style="font-size: 11px; opacity: 0.8; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#ffffff').replace('width="24" height="24"', 'width="12" height="12"')}</span>
                                    <span>${typeof order.deliveryTime === 'string' && order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime}${order.deliveryExactTime && (order.deliveryType === 'selfPickup' || !order.deliveryType) ? ` (${order.deliveryExactTime})` : ''}</span>
                                </div>
                            ` : ''}
                            </div>
                        ` : '<div style="flex: 1;"></div>'}
                        <div style="text-align: right; border-left: ${order.deliveryType || order.location ? '1px solid rgba(255,255,255,0.2); padding-left: 16px;' : 'none;'};">
                            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">Итого</div>
                            <div style="font-size: 18px; font-weight: 700;">${totalAmount}</div>
                        </div>
                    </div>
                </div>
                
                ${order.status === 'pending' || order.status === 'processing' ? `
                    <div style="padding: 16px; background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%); 
                        border-radius: 12px; text-align: center; border: 2px solid #FF9800; margin-bottom: 12px;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#FF9800')}</div>
                        <div style="font-weight: 600; color: #F57C00; font-size: 14px; margin-bottom: 4px;">${statusText}</div>
                        <div style="font-size: 12px; color: #666;">Заказ отправлен менеджеру и будет обработан в ближайшее время</div>
                        </div>
                    <button onclick="cancelOrder('${order.id}')" style="width: 100%; padding: 16px; 
                        background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; border: none; border-radius: 12px; 
                        font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(244,67,54,0.3);
                        transition: all 0.2s;"
                        onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(244,67,54,0.4)'"
                        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(244,67,54,0.3)'">
                            Отменить заказ
                        </button>
                ` : order.status === 'confirmed' ? `
                    <div style="padding: 16px; background: linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%); 
                        border-radius: 12px; text-align: center; border: 2px solid #4CAF50; margin-bottom: 12px;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getSuccessIcon('#4CAF50')}</div>
                        <div style="font-weight: 600; color: #2E7D32; font-size: 14px; margin-bottom: 4px;">Заказ принят</div>
                        <div style="font-size: 12px; color: #666;">Ожидание подтверждения передачи товара</div>
                            </div>
                    <div>
                        <button onclick="cancelOrder('${order.id}')" style="width: 100%; padding: 16px; 
                            background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; border: none; border-radius: 12px; 
                            font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(244,67,54,0.3);
                            transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;"
                            onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(244,67,54,0.4)'"
                            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(244,67,54,0.3)'">
                            <span>Отменить заказ</span>
                        </button>
                        </div>
                ` : order.status === 'transferred' ? `
                    <div style="padding: 16px; background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%); 
                        border-radius: 12px; text-align: center; border: 2px solid #2196F3; margin-bottom: 12px;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getSuccessIcon('#2196F3')}</div>
                        <div style="font-weight: 600; color: #1976d2; font-size: 14px; margin-bottom: 4px;">Спасибо за покупку!</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Заказ успешно передан</div>
                        ${(() => {
                            let rewardsHtml = '';
                            const coinsEarned = order.vapeCoinsEarned || 0;
                            
                            // Всегда вычисляем штампы для отображения
                            let stampsToAdd = 0;
                            let showPartialStamp = false;
                            
                            const totalItems = order.items.reduce((sum, item) => {
                                const paymentMethod = item.paymentMethod || 'money';
                                if (paymentMethod === 'money') {
                                    return sum + item.quantity;
                                }
                                return sum;
                            }, 0);
                            
                            if (totalItems > 0) {
                                // Используем правильную логику: 1 товар = 0.5 штампа
                                // Вычисляем сколько целых штампов добавилось
                                stampsToAdd = Math.floor(totalItems / 2);
                                
                                // Проверяем частичный прогресс (для 1 товара = 0.5)
                                const savedPartialProgress = localStorage.getItem('partialItemsProgress');
                                const currentPartialProgress = savedPartialProgress ? parseFloat(savedPartialProgress) : 0;
                                
                                // Если был 1 товар, всегда показываем 0.5 штампа
                                if (totalItems === 1 && stampsToAdd === 0) {
                                    showPartialStamp = true;
                                } else if (totalItems > 1) {
                                    // Для нескольких товаров проверяем остаток
                                    const remainder = totalItems % 2;
                                    if (remainder === 1) {
                                        // Если остался 1 товар после целых штампов, показываем 0.5
                                        showPartialStamp = true;
                                    }
                                }
                            }
                            
                            // Показываем награды если есть коины или штампы
                            if (coinsEarned > 0 || stampsToAdd > 0 || showPartialStamp) {
                                rewardsHtml = '<div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center;">';
                                
                                if (coinsEarned > 0) {
                                    rewardsHtml += `
                                        <div style="display: flex; align-items: center; gap: 6px; color: #FF9800; font-weight: 600; font-size: 15px;">
                                            <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 20)}</span>
                                            <span>+ ${coinsEarned.toFixed(1)} коинов</span>
                    </div>
                                    `;
                                }
                                
                                // Показываем штампы (включая 0.5)
                                if (stampsToAdd > 0) {
                                    rewardsHtml += `
                                        <div style="display: flex; align-items: center; gap: 6px; color: #FF9800; font-weight: 600; font-size: 15px;">
                                            <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getTrophyIcon('#FF9800').replace('width="32" height="32"', 'width="20" height="20"')}</span>
                                            <span>+ ${stampsToAdd} ${stampsToAdd === 1 ? 'штамп' : stampsToAdd < 5 ? 'штампа' : 'штампов'}</span>
                </div>
                                    `;
                                } else if (showPartialStamp) {
                                    // Показываем 0.5 штампа если добавился только частичный прогресс
                                    rewardsHtml += `
                                        <div style="display: flex; align-items: center; gap: 6px; color: #FF9800; font-weight: 600; font-size: 15px;">
                                            <span style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">${getTrophyIcon('#FF9800').replace('width="32" height="32"', 'width="20" height="20"')}</span>
                                            <span>+ 0.5 штампа</span>
                </div>
                                    `;
                                }
                                
                                rewardsHtml += '</div>';
                            }
                            
                            return rewardsHtml;
                        })()}
                    </div>
                ` : order.status === 'rejected' ? `
                    <div style="padding: 16px; background: linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%); 
                        border-radius: 12px; text-align: center; border: 2px solid #f44336;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getCrossIcon('#f44336')}</div>
                        <div style="font-weight: 600; color: #c62828; font-size: 14px;">Заказ отклонен менеджером</div>
                        ${order.vapeCoinsSpent > 0 ? `
                            <div style="margin-top: 8px; font-size: 12px; color: #999; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 14)}</span>
                                <span>Коины возвращены: ${order.vapeCoinsSpent.toFixed(1)}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : order.status === 'processing' ? `
                    <div>
                        <button onclick="cancelOrder('${order.id}')" style="width: 100%; padding: 16px; 
                            background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; border: none; border-radius: 12px; 
                            font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(244,67,54,0.3);
                            transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;"
                            onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(244,67,54,0.4)'"
                            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(244,67,54,0.3)'">
                            <span>Отменить заказ</span>
                        </button>
                    </div>
                ` : order.status === 'cancelled' ? `
                    <div style="padding: 16px; background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%); 
                        border-radius: 12px; text-align: center; border: 2px solid #e0e0e0;">
                        <div style="width: 32px; height: 32px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center;">${getCrossIcon('#999')}</div>
                        <div style="font-weight: 600; color: #666; font-size: 14px;">Заказ отменен</div>
                        ${order.vapeCoinsSpent > 0 ? `
                            <div style="margin-top: 8px; font-size: 12px; color: #999; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 14)}</span>
                                <span>Коины возвращены: ${order.vapeCoinsSpent.toFixed(1)}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        }).join('')}
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Очистить заказы по статусу
function clearOrdersByStatus(status) {
    if (!status) return;
    
    // Если выбран "Все", удаляем все заказы
    if (status === 'all') {
        if (tg && tg.showPopup) {
            tg.showPopup({
                title: '⚠️ Подтверждение',
                message: 'Вы уверены, что хотите удалить все заказы? Это действие нельзя отменить.',
                buttons: [
                    {id: 'confirm', type: 'destructive', text: 'Удалить все'},
                    {id: 'cancel', type: 'cancel', text: 'Отмена'}
                ]
            }, (btnId) => {
                if (btnId === 'confirm') {
                    const initialLength = orders.length;
                    orders = [];
                    localStorage.setItem('orders', JSON.stringify(orders));
                    
                    const deletedCount = initialLength;
                    showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
                    
                    showOrders();
                }
            });
        } else {
            if (confirm('Вы уверены, что хотите удалить все заказы?')) {
                const initialLength = orders.length;
                orders = [];
                localStorage.setItem('orders', JSON.stringify(orders));
                
                const deletedCount = initialLength;
                showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
                
                showOrders();
            }
        }
        return;
    }
    
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '⚠️ Подтверждение',
            message: `Вы уверены, что хотите удалить все заказы со статусом "${status === 'processing' ? 'В обработке' : status === 'received' ? 'Подтвержденные' : 'Отмененные'}"? Это действие нельзя отменить.`,
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Удалить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                // Удаляем заказы с указанным статусом
                const initialLength = orders.length;
                orders = orders.filter(o => o.status !== status);
                localStorage.setItem('orders', JSON.stringify(orders));
                
                const deletedCount = initialLength - orders.length;
                showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
                
                // Показываем заказы снова (вернемся на вкладку "Все" если текущая категория пуста)
                showOrders();
            }
        });
    } else {
        if (confirm(`Вы уверены, что хотите удалить все заказы со статусом "${status === 'processing' ? 'В обработке' : status === 'received' ? 'Подтвержденные' : 'Отмененные'}"?`)) {
            const initialLength = orders.length;
            orders = orders.filter(o => o.status !== status);
            localStorage.setItem('orders', JSON.stringify(orders));
            
            const deletedCount = initialLength - orders.length;
            showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
            
            showOrders();
        }
    }
}

// Отменить заказ
function cancelOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Можно отменить только заказы в ожидании, обработке или подтвержденные (но не переданные, отклоненные или отмененные)
    if (order.status !== 'pending' && order.status !== 'processing' && order.status !== 'confirmed') {
        if (order.status === 'transferred') {
            showToast('Заказ уже передан, его нельзя отменить', 'warning', 3000);
        } else if (order.status === 'rejected') {
            showToast('Заказ уже отклонен', 'warning', 3000);
        } else if (order.status === 'cancelled') {
            showToast('Заказ уже отменен', 'warning', 3000);
        } else {
            showToast('Этот заказ нельзя отменить', 'warning', 3000);
        }
        return;
    }
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    // Создаем кастомное модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const closeModal = () => {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; background: #ffebee; border-radius: 50%;">
                ${getCrossIcon('#f44336').replace('width="24" height="24"', 'width="32" height="32"')}
            </div>
            <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #000;">Отмена заказа</div>
            <div style="font-size: 14px; color: #666; line-height: 1.5;">
                Вы уверены, что хотите отменить заказ #${order.id.slice(-6)}?${order.vapeCoinsSpent > 0 ? `<br><br>Коины будут возвращены: <strong>${order.vapeCoinsSpent.toFixed(1)}</strong>` : ''}<br><br>Товары можно будет выбрать заново.
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button id="cancel-order-btn" style="flex: 1; padding: 14px; background: #f5f5f5; color: #666; border: 2px solid #e5e5e5; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                Нет, оставить
            </button>
            <button id="confirm-cancel-btn" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(244,67,54,0.3);">
                Да, отменить
            </button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    const cancelBtn = modalContent.querySelector('#cancel-order-btn');
    const confirmBtn = modalContent.querySelector('#confirm-cancel-btn');
    
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        
        // Выполняем отмену заказа
                // Возвращаем коины, если они были потрачены
                if (order.vapeCoinsSpent && order.vapeCoinsSpent > 0) {
                    vapeCoins += order.vapeCoinsSpent;
                    localStorage.setItem('vapeCoins', vapeCoins.toString());
                    
                    // Добавляем транзакцию о возврате
                    vapeCoinsHistory.unshift({
                        id: `vc_${Date.now()}`,
                        date: new Date().toISOString(),
                        type: 'earned',
                        amount: order.vapeCoinsSpent,
                        orderId: order.id,
                        description: `Возврат за заказ #${order.id.slice(-6)}`,
                        cancelled: true, // Флаг для отмененного заказа
                        isRefund: true // Флаг для возврата коинов
                    });
                    localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                }
                
                // Отправляем уведомление на сервер об отмене заказа
                (async () => {
                    try {
                        const response = await fetch(`${SERVER_URL}/api/orders/${order.id}/cancel`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                orderId: order.id,
                                userId: tg?.initDataUnsafe?.user?.id?.toString() || 'unknown'
                            })
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            console.log('Order cancellation sent to server:', result);
                        }
                    } catch (error) {
                        console.error('Error sending cancellation to server:', error);
                        // Продолжаем выполнение даже если сервер недоступен
                    }
                })();
                
                // Меняем статус заказа на "отменен" вместо удаления
                order.status = 'cancelled';
                localStorage.setItem('orders', JSON.stringify(orders));
                
                // Обновляем отображение
        showOrders();
                
                // Обновляем профиль если открыт
                if (currentPage === 'profile') {
                    showProfile();
                }
                
                // Показываем уведомление об отмене (красное)
                showToast(`Заказ #${order.id.slice(-6)} отменен`, 'error', 3000);
                
                // Если были списаны коины, показываем второе уведомление о возврате
                if (order.vapeCoinsSpent && order.vapeCoinsSpent > 0) {
                    setTimeout(() => {
                        showToast(`Коины возвращены на баланс\n+${order.vapeCoinsSpent.toFixed(1)} 🪙`, 'success', 4000);
                    }, 3500);
                }
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('error');
        }
    });
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
    
    // Запасной вариант (fallback)
    if (!tg || !tg.showPopup) {
        // Запасной вариант
        if (confirm(`Отменить заказ #${order.id.slice(-6)}?${order.vapeCoinsSpent > 0 ? `\n\nКоины будут возвращены: ${order.vapeCoinsSpent.toFixed(1)} 🪙` : ''}`)) {
            // Возвращаем коины
            if (order.vapeCoinsSpent && order.vapeCoinsSpent > 0) {
                vapeCoins += order.vapeCoinsSpent;
                localStorage.setItem('vapeCoins', vapeCoins.toString());
                
                vapeCoinsHistory.unshift({
                    id: `vc_${Date.now()}`,
                    date: new Date().toISOString(),
                    type: 'earned',
                    amount: order.vapeCoinsSpent,
                    orderId: order.id,
                    description: `Возврат за заказ #${order.id.slice(-6)}`,
                    cancelled: true, // Флаг для отмененного заказа
                    isRefund: true // Флаг для возврата коинов
                });
                localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
            }
            
            // Меняем статус заказа на "отменен" вместо удаления
            order.status = 'cancelled';
            localStorage.setItem('orders', JSON.stringify(orders));
            
            showOrders();
            
            if (currentPage === 'profile') {
                showProfile();
            }
            
            // Показываем уведомление об отмене (красное)
            showToast(`Заказ #${order.id.slice(-6)} отменен`, 'error', 3000);
            
            // Если были списаны коины, показываем второе уведомление о возврате
            if (order.vapeCoinsSpent && order.vapeCoinsSpent > 0) {
                setTimeout(() => {
                    showToast(`Коины возвращены на баланс\n+${order.vapeCoinsSpent.toFixed(1)} 🪙`, 'success', 4000);
                }, 3500);
            }
        }
    }
}

// Отметить заказ как полученный
function markOrderAsReceived(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    // Создаем кастомное модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; background: #e8f5e9; border-radius: 50%;">
                ${getSuccessIcon('#4CAF50').replace('width="24" height="24"', 'width="32" height="32"')}
            </div>
            <div style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #000;">Подтверждение</div>
            <div style="font-size: 14px; color: #666; line-height: 1.5;">
                Отметить заказ #${order.id.slice(-6)} как полученный?
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button id="cancel-received-btn" style="flex: 1; padding: 14px; background: #f5f5f5; color: #666; border: 2px solid #e5e5e5; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                Отмена
            </button>
            <button id="confirm-received-btn" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(76,175,80,0.3);">
                Да
            </button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeModal = () => {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    const cancelBtn = modalContent.querySelector('#cancel-received-btn');
    const confirmBtn = modalContent.querySelector('#confirm-received-btn');
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        
        // Выполняем подтверждение получения
                // Обновляем статус сразу
                order.status = 'received';
                localStorage.setItem('orders', JSON.stringify(orders));
                
                // Обновляем отображение сразу для визуального изменения
        showOrders();
                
                // Добавляем штампы за заказ (2 товара = 1 штамп)
                // Считаем количество товаров, оплаченных деньгами (не коинами)
                // Товары, оплаченные коинами, не дают штампы
                const totalItems = order.items.reduce((sum, item) => {
                    const paymentMethod = item.paymentMethod || 'money';
                    // Считаем только товары, оплаченные деньгами
                    if (paymentMethod === 'money') {
                        return sum + item.quantity;
                    }
                    return sum;
                }, 0);
                
                // Начисляем штампы только если есть товары, оплаченные деньгами
                let stampsToAdd = 0;
                let newCompletedSets = 0;
                let totalBonusCoins = 0;
                let bonusMessages = [];
                
                if (totalItems > 0) {
                    const maxStampsPerSet = 10;
                    const bonusStamps5 = 5; // Бонус за 5 штампов
                    const bonusStamps10 = 10; // Бонус за 10 штампов
                    
                    // За каждые 2 товара получаем 1 штамп (только за товары, оплаченные деньгами)
                    // Учитываем частичный прогресс: 1 товар = 0.5 штампа
                    const totalProgress = partialItemsProgress + (totalItems / 2); // Добавляем текущий прогресс к новым товарам
                    stampsToAdd = Math.floor(totalProgress); // Целые штампы
                    partialItemsProgress = totalProgress - stampsToAdd; // Остаток (0-0.99)
                    
                    // Добавляем штампы
                    const previousStamps = stamps;
                    stamps += stampsToAdd;
                    
                    // Проверяем бонус за 5 штампов (только если мы перешли порог 5)
                    if (stamps >= bonusStamps5 && previousStamps < bonusStamps5) {
                        const bonus5 = 5;
                        totalBonusCoins += bonus5;
                        bonusMessages.push('5 штампов');
                    }
                    
                    // Проверяем бонус за 10 штампов
                    if (stamps >= maxStampsPerSet) {
                        newCompletedSets = Math.floor(stamps / maxStampsPerSet);
                        completedStampSets += newCompletedSets;
                        stamps = stamps % maxStampsPerSet; // Оставляем остаток
                        
                        // Начисляем 10 коинов за каждый полный набор из 10 штампов
                        const bonus10 = newCompletedSets * 10;
                        totalBonusCoins += bonus10;
                        bonusMessages.push(`${newCompletedSets} ${newCompletedSets === 1 ? 'полный набор из 10 штампов' : 'полных наборов из 10 штампов'}`);
                    }
                    
                    // Сохраняем общее количество штампов и прогресс (для совместимости)
                    const totalStamps = completedStampSets * maxStampsPerSet + stamps;
                    localStorage.setItem('stamps', totalStamps.toString());
                    localStorage.setItem('completedStampSets', completedStampSets.toString());
                    localStorage.setItem('partialItemsProgress', partialItemsProgress.toString());
                }
                
                // Начисляем Vape Coins за заказ (только за товары, оплаченные деньгами)
                // Если товар оплачен коинами - коины не начисляются
                // Формула начисления: price / 10 (за каждые 10 BYN получаем 1 коин)
                let coinsEarned = 0;
        order.items.forEach(item => {
            // Проверяем способ оплаты товара
            // Если paymentMethod === 'coins' - не начисляем коины
            // Если paymentMethod === 'money' или не указан - начисляем коины
            const paymentMethod = item.paymentMethod || 'money'; // По умолчанию 'money' для старых заказов
            
            if (paymentMethod === 'money') {
                // Формула начисления: price / 10 (18 BYN = 1.8 коинов)
                const coinsForItem = (item.price * item.quantity) / 10;
                coinsEarned += coinsForItem;
            }
            // Если paymentMethod === 'coins', пропускаем (не начисляем)
        });
        
        // Показываем уведомление о коинах за покупку (если есть)
        const paidWithCoinsItems = order.items.filter(item => item.paymentMethod === 'coins').reduce((sum, item) => sum + item.quantity, 0);
        const paidWithMoneyItems = order.items.filter(item => (item.paymentMethod || 'money') === 'money').reduce((sum, item) => sum + item.quantity, 0);
        
        if (coinsEarned > 0) {
            vapeCoins += coinsEarned;
            localStorage.setItem('vapeCoins', vapeCoins.toString());
            
            // Добавляем в историю
            vapeCoinsHistory.unshift({
                        id: `vc_${Date.now()}`,
                        date: new Date().toISOString(),
                        type: 'earned',
                        amount: coinsEarned,
                        orderId: order.id,
                        description: `Заказ #${order.id.slice(-6)}`
                    });
                    localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                    
                    // Показываем уведомление о коинах за покупку
                    let toastMessage = '';
                    if (paidWithCoinsItems > 0 && paidWithMoneyItems === 0) {
                        toastMessage = 'Заказ получен';
                    } else if (stampsToAdd > 0) {
                        toastMessage = `Получено ${stampsToAdd} ${stampsToAdd === 1 ? 'штамп' : stampsToAdd < 5 ? 'штампа' : 'штампов'}\n+ ${coinsEarned.toFixed(1)} коинов`;
                    } else {
                        toastMessage = `Заказ получен\n+ ${coinsEarned.toFixed(1)} коинов`;
                    }
                    
                    showToast(toastMessage, 'success', 4000);
                    
                    // Если есть бонусы за штампы, показываем их после уведомления о коинах за покупку
                    if (totalBonusCoins > 0) {
                        setTimeout(() => {
                            // Начисляем бонусы за штампы
                            vapeCoins += totalBonusCoins;
                            localStorage.setItem('vapeCoins', vapeCoins.toString());
                            
                            // Добавляем в историю
                            vapeCoinsHistory.unshift({
                                id: `vc_${Date.now()}`,
                                date: new Date().toISOString(),
                                type: 'earned',
                                amount: totalBonusCoins,
                                description: `Бонус за ${bonusMessages.join(' и ')}`
                            });
                            localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                            
                            // Показываем уведомление о бонусах
                            let bonusMessage = '';
                            if (bonusMessages.length === 1) {
                                if (bonusMessages[0].includes('полный набор')) {
                                    bonusMessage = `🎉 Полный набор из 10 штампов!\nНачислено ${totalBonusCoins} коинов`;
                                } else {
                                    bonusMessage = `🎉 Получено 5 штампов!\nНачислено ${totalBonusCoins} коинов`;
                                }
                            } else {
                                bonusMessage = `🎉 Бонусы получены!\nНачислено ${totalBonusCoins} коинов`;
                            }
                            showToast(bonusMessage, 'success', 5000);
                        }, 4500); // Показываем через 4.5 секунды (после первого уведомления)
                    }
                } else {
                    // Если нет коинов за покупку, но есть бонусы за штампы
                    if (totalBonusCoins > 0) {
                        vapeCoins += totalBonusCoins;
                        localStorage.setItem('vapeCoins', vapeCoins.toString());
                        
                        // Добавляем в историю
                        vapeCoinsHistory.unshift({
                            id: `vc_${Date.now()}`,
                            date: new Date().toISOString(),
                            type: 'earned',
                            amount: totalBonusCoins,
                            description: `Бонус за ${bonusMessages.join(' и ')}`
                        });
                        localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                        
                        // Показываем уведомление о бонусах
                        let bonusMessage = '';
                        if (bonusMessages.length === 1) {
                            if (bonusMessages[0].includes('полный набор')) {
                                bonusMessage = `🎉 Полный набор из 10 штампов!\nНачислено ${totalBonusCoins} коинов`;
                            } else {
                                bonusMessage = `🎉 Получено 5 штампов!\nНачислено ${totalBonusCoins} коинов`;
                            }
                        } else {
                            bonusMessage = `🎉 Бонусы получены!\nНачислено ${totalBonusCoins} коинов`;
                        }
                        showToast(bonusMessage, 'success', 5000);
                    } else {
                        // Если нет ни коинов за покупку, ни бонусов - показываем простое уведомление
                        let toastMessage = '';
                        if (paidWithCoinsItems > 0 && paidWithMoneyItems === 0) {
                            toastMessage = 'Заказ получен';
                        } else if (stampsToAdd > 0) {
                            toastMessage = `Получено ${stampsToAdd} ${stampsToAdd === 1 ? 'штамп' : stampsToAdd < 5 ? 'штампа' : 'штампов'}`;
                        } else {
                            toastMessage = 'Заказ получен';
                        }
                        showToast(toastMessage, 'success', 4000);
                    }
                }
                
                // Обновляем отображение сразу после изменения статуса
                showOrders();
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
        }
    });
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
    
    // Запасной вариант (fallback)
    if (!tg || !tg.showPopup) {
        if (confirm('Отметить заказ как полученный?')) {
            order.status = 'received';
            localStorage.setItem('orders', JSON.stringify(orders));
            showOrders();
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    }
}

// Показать Vape Coins
function showVapeCoins() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    container.innerHTML = `
        <div style="background: linear-gradient(135deg, #FF9800 0%, #FF6B00 100%); padding: 24px; border-radius: 12px; margin-bottom: 16px; color: white; text-align: center;">
            <div style="width: 60px; height: 60px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#ffffff')}</div>
            <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">${vapeCoins.toFixed(1)}</div>
            <div style="font-size: 16px; opacity: 0.9;">Vape Coins</div>
        </div>
        
        <div style="background: #ffffff; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 12px;">
                <span>Как получить Vape Coins?</span>
            </div>
            <div style="color: #666; font-size: 14px; line-height: 1.6;">
                <p style="margin-bottom: 12px;">Получайте Vape Coins за каждый полученный заказ!</p>
                <div style="background: #f8f8f8; padding: 16px; border-radius: 8px; margin-top: 12px;">
                    <div style="font-weight: 600; margin-bottom: 12px; color: #000; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                        ${getChartIcon('#666666')}
                        <span>Правило начисления:</span>
                    </div>
                    <div style="color: #000; margin-bottom: 12px; font-weight: 500;">
                        За каждые 10 BYN стоимости товара вы получаете 1 Vape Coin
                    </div>
                    <div style="background: #fff; padding: 12px; border-radius: 6px; border-left: 3px solid #FF9800; margin-bottom: 12px;">
                        <div style="font-weight: 600; margin-bottom: 8px; color: #000; font-size: 13px;">Примеры:</div>
                        <div style="font-size: 12px; color: #666; line-height: 1.6;">
                            <div style="margin-bottom: 3px; white-space: nowrap;">• <strong>10 BYN</strong> = <strong style="color: #FF9800;">1.0</strong> коин</div>
                            <div style="margin-bottom: 3px; white-space: nowrap;">• <strong>15 BYN</strong> = <strong style="color: #FF9800;">1.5</strong> коина</div>
                            <div style="white-space: nowrap;">• <strong>20 BYN</strong> = <strong style="color: #FF9800;">2.0</strong> коина</div>
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #999; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e5e5; display: flex; align-items: center; gap: 6px;">
                        ${getBulbIcon('#FF9800')}
                        <span>Если в заказе несколько товаров, коины суммируются</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div style="background: #ffffff; padding: 20px; border-radius: 12px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                ${getNoteIcon('#666666')}
                <span>История транзакций</span>
            </div>
            ${vapeCoinsHistory.length === 0 ? `
                <div style="text-align: center; padding: 40px 20px; color: #999;">
                    <div style="width: 60px; height: 60px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center;">${getNoteIcon('#999')}</div>
                    <div>История транзакций пуста</div>
                    <div style="font-size: 12px; margin-top: 8px;">Начните делать заказы, чтобы получать Vape Coins!</div>
                </div>
            ` : `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${vapeCoinsHistory.slice(0, 20).map((transaction, idx) => {
                        const transactionDate = new Date(transaction.date);
                        const formattedDate = transactionDate.toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        
                        const isClickable = transaction.orderId;
                        const cursorStyle = isClickable ? 'cursor: pointer;' : '';
                        const onclickAttr = isClickable ? `onclick="showVapeCoinsOrderDetails('${transaction.orderId}')"` : '';
                        
                        // Проверяем, был ли заказ отменен
                        const order = orders.find(o => o.id === transaction.orderId);
                        const isCancelled = transaction.cancelled || (order && order.status === 'cancelled');
                        const isRefund = transaction.isRefund || false; // Флаг возврата коинов
                        // Для возврата коинов не показываем бейдж "Отменен" и не делаем серым
                        const statusBadge = (isCancelled && !isRefund) ? '<span style="background: #f5f5f5; color: #999; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">Отменен</span>' : '';
                        
                        // Если это возврат коинов, делаем зеленым, а не серым
                        const isRefundTransaction = isRefund && transaction.type === 'earned';
                        const bgColor = isRefundTransaction ? '#f8f8f8' : (isCancelled && !isRefund ? '#f5f5f5' : '#f8f8f8');
                        const hoverBgColor = isRefundTransaction ? '#f0f0f0' : (isCancelled && !isRefund ? '#e8e8e8' : '#f0f0f0');
                        const textColor = isRefundTransaction ? '#000' : (isCancelled && !isRefund ? '#999' : '#000');
                        const dateColor = isRefundTransaction ? '#666' : (isCancelled && !isRefund ? '#999' : '#666');
                        const amountColor = isRefundTransaction ? '#4CAF50' : (isCancelled && !isRefund ? '#999' : (transaction.type === 'spent' ? '#f44336' : '#4CAF50'));
                        const opacity = (isCancelled && !isRefund) ? 'opacity: 0.7;' : '';
                        
                        return `
                            <div ${onclickAttr} style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: ${bgColor}; border-radius: 8px; ${cursorStyle} transition: background 0.2s; ${opacity}" 
                                onmouseover="${isClickable ? "this.style.background='" + hoverBgColor + "'" : ''}" 
                                onmouseout="${isClickable ? "this.style.background='" + bgColor + "'" : ''}">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; margin-bottom: 4px; color: ${textColor}; display: flex; align-items: center;">
                                        ${transaction.description || 'Начисление'}${statusBadge}
                                    </div>
                                    <div style="font-size: 12px; color: ${dateColor};">${formattedDate}</div>
                                </div>
                                <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
                                    <div style="font-weight: 700; color: ${amountColor}; font-size: 16px; display: flex; align-items: center; gap: 4px;">
                                        <span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 16)}</span>
                                        <span>${transaction.type === 'spent' ? '-' : '+'}${Math.abs(transaction.amount).toFixed(1)}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Показать настройки
function showSettings() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    container.innerHTML = `
        <div style="background: ${colors.bgCard}; padding: 20px; border-radius: 12px; margin-bottom: 16px; color: ${colors.text};">
            <div style="font-size: 20px; font-weight: 700; margin-bottom: 20px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                ${getSettingsIcon(colors.text)}
                <span>Настройки</span>
            </div>
            
            <div style="margin-bottom: 24px;">
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: ${colors.text}; display: flex; align-items: center; gap: 6px;">
                    ${darkMode ? getMoonIcon('#666666') : getSunIcon('#FF9800')}
                    <span>Тема оформления</span>
                </div>
                <div onclick="toggleTheme()" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: ${darkMode ? colors.bgSecondary : '#f5f5f5'}; border-radius: 12px; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${darkMode ? getMoonIcon('#666666') : getSunIcon('#FF9800')}</div>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px; color: ${colors.text};">${darkMode ? 'Темная тема' : 'Светлая тема'}</div>
                            <div style="font-size: 12px; color: ${colors.textSecondary};">${darkMode ? 'Темный фон интерфейса' : 'Светлый фон интерфейса'}</div>
                        </div>
                    </div>
                    <div style="width: 50px; height: 28px; background: ${darkMode ? '#007AFF' : '#ccc'}; border-radius: 14px; position: relative; transition: all 0.3s;">
                        <div style="width: 24px; height: 24px; background: white; border-radius: 50%; position: absolute; top: 2px; ${darkMode ? 'right: 2px;' : 'left: 2px;'} transition: all 0.3s;"></div>
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 24px;">
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: ${colors.text}; display: flex; align-items: center; gap: 6px;">
                    ${getCrossIcon('#999999')}
                    <span>Очистка данных</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div onclick="clearVapeCoinsHistory()" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800')}</div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 2px;">Очистить историю транзакций</div>
                                <div style="font-size: 12px; color: #666;">Удалить все записи об операциях с коинами</div>
                            </div>
                        </div>
                        <div style="font-size: 20px;">→</div>
                    </div>
                    
                    <div onclick="clearCart()" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getCartIcon('#007AFF')}</div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 2px;">Очистить корзину</div>
                                <div style="font-size: 12px; color: #666;">Удалить все товары из корзины</div>
                            </div>
                        </div>
                        <div style="font-size: 20px;">→</div>
                    </div>
                    
                    <div onclick="clearViewedProducts()" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getEyeIcon('#666666')}</div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 2px;">Очистить недавно просмотренные</div>
                                <div style="font-size: 12px; color: #666;">Удалить историю просмотра товаров</div>
                            </div>
                        </div>
                        <div style="font-size: 20px;">→</div>
                    </div>
                    
                    <div onclick="clearFavorites()" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getHeartFilledIcon('#ff4444')}</div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 2px;">Очистить избранное</div>
                                <div style="font-size: 12px; color: #666;">Удалить все товары из избранного</div>
                            </div>
                        </div>
                        <div style="font-size: 20px;">→</div>
                    </div>
                    
                    <div onclick="clearOrdersHistory()" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#007AFF')}</div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 2px;">Очистить историю заказов</div>
                                <div style="font-size: 12px; color: #666;">Удалить все заказы, кроме находящихся в обработке</div>
                            </div>
                        </div>
                        <div style="font-size: 20px;">→</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
    
    if (backBtn) backBtn.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'none';
}

// Переключение темы
function toggleTheme() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode.toString());
    applyTheme();
    showSettings(); // Обновляем страницу настроек
}

// Применить тему
function applyTheme() {
    if (darkMode) {
        document.body.classList.add('dark-mode');
        document.body.style.background = '#1a1a1a';
        document.body.style.color = '#ffffff';
        // Устанавливаем цвет фона для Telegram Web App
        if (tg && tg.setHeaderColor) {
            tg.setHeaderColor('#1a1a1a');
        }
        if (tg && tg.setBackgroundColor) {
            tg.setBackgroundColor('#1a1a1a');
        }
        
        // Применяем темную тему ко всем контейнерам
        const containers = document.querySelectorAll('#page-content, .main-content, #main-content');
        containers.forEach(container => {
            if (container) {
                container.style.background = '#1a1a1a';
                container.style.color = '#ffffff';
            }
        });
    } else {
        document.body.classList.remove('dark-mode');
        document.body.style.background = '#ffffff';
        document.body.style.color = '#000000';
        // Сбрасываем цвет фона для Telegram Web App
        if (tg && tg.setHeaderColor) {
            tg.setHeaderColor('#ffffff');
        }
        if (tg && tg.setBackgroundColor) {
            tg.setBackgroundColor('#ffffff');
        }
        
        // Применяем светлую тему ко всем контейнерам
        const containers = document.querySelectorAll('#page-content, .main-content, #main-content');
        containers.forEach(container => {
            if (container) {
                container.style.background = '#f5f5f5';
                container.style.color = '#000000';
            }
        });
    }
    
    // Перерисовываем текущую страницу с учетом темы
    if (currentPage && currentPage !== 'product') {
        showPage(currentPage, true);
    }
}

// Очистить историю транзакций Vape Coins
function clearVapeCoinsHistory() {
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '⚠️ Подтверждение',
            message: 'Вы уверены, что хотите очистить историю транзакций Vape Coins? Это действие нельзя отменить.',
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Очистить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                vapeCoinsHistory = [];
                localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                showToast('История транзакций очищена', 'success', 3000);
                showSettings();
            }
        });
    } else {
        if (confirm('Вы уверены, что хотите очистить историю транзакций Vape Coins?')) {
            vapeCoinsHistory = [];
            localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
            showToast('История транзакций очищена', 'success', 3000);
            showSettings();
        }
    }
}

// Очистить корзину
function clearCart() {
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '⚠️ Подтверждение',
            message: 'Вы уверены, что хотите очистить корзину? Все товары будут удалены.',
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Очистить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                cart = [];
                localStorage.setItem('cart', JSON.stringify(cart));
                syncCartToServer(); // Синхронизируем с сервером
                updateCartBadge();
                showToast('Корзина очищена', 'success', 3000);
                showSettings();
            }
        });
    } else {
        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            cart = [];
            localStorage.setItem('cart', JSON.stringify(cart));
            syncCartToServer(); // Синхронизируем с сервером
            updateCartBadge();
            showToast('Корзина очищена', 'success', 3000);
            showSettings();
        }
    }
}

// Очистить недавно просмотренные товары
function clearViewedProducts() {
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '⚠️ Подтверждение',
            message: 'Вы уверены, что хотите очистить историю просмотренных товаров?',
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Очистить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                viewedProducts = [];
                localStorage.setItem('viewedProducts', JSON.stringify(viewedProducts));
                showToast('История просмотра очищена', 'success', 3000);
                showSettings();
            }
        });
    } else {
        if (confirm('Вы уверены, что хотите очистить историю просмотренных товаров?')) {
            viewedProducts = [];
            localStorage.setItem('viewedProducts', JSON.stringify(viewedProducts));
            showToast('История просмотра очищена', 'success', 3000);
            showSettings();
        }
    }
}

// Очистить избранное
function clearFavorites() {
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '⚠️ Подтверждение',
            message: 'Вы уверены, что хотите очистить избранное? Все товары будут удалены из избранного.',
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Очистить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                favorites = [];
                localStorage.setItem('favorites', JSON.stringify(favorites));
                showToast('Избранное очищено', 'success', 3000);
                showSettings();
            }
        });
    } else {
        if (confirm('Вы уверены, что хотите очистить избранное?')) {
            favorites = [];
            localStorage.setItem('favorites', JSON.stringify(favorites));
            showToast('Избранное очищено', 'success', 3000);
            showSettings();
        }
    }
}

// Очистить историю заказов (кроме заказов в обработке)
function clearOrdersHistory() {
    // Определяем заказы, которые нужно сохранить (в обработке, ожидании, подтвержденные, переданные)
    const protectedOrders = orders.filter(order => 
        order.status === 'processing' || 
        order.status === 'pending' || 
        order.status === 'confirmed' || 
        order.status === 'transferred'
    );
    
    // Подсчитываем количество заказов, которые будут удалены
    const ordersToDelete = orders.filter(order => 
        order.status !== 'processing' && 
        order.status !== 'pending' && 
        order.status !== 'confirmed' && 
        order.status !== 'transferred'
    );
    
    if (ordersToDelete.length === 0) {
        showToast('Нет заказов для удаления', 'info', 3000);
        return;
    }
    
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: 'Подтверждение',
            message: `Вы уверены, что хотите очистить историю заказов?\n\nБудет удалено: ${ordersToDelete.length} заказ(ов)\nСохранено (в обработке/ожидании/подтвержденных): ${protectedOrders.length} заказ(ов)\n\nЭто действие нельзя отменить.`,
            buttons: [
                {id: 'confirm', type: 'destructive', text: 'Очистить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                const deletedCount = ordersToDelete.length;
                // Оставляем только заказы в обработке, ожидании и подтвержденные
                orders = protectedOrders;
                localStorage.setItem('orders', JSON.stringify(orders));
                
                showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
                
                // Обновляем отображение заказов, если пользователь на странице заказов
                if (currentPage === 'orders') {
                    showOrders();
                } else {
                    showSettings();
                }
            }
        });
    } else {
        if (confirm(`Вы уверены, что хотите очистить историю заказов?\n\nБудет удалено: ${ordersToDelete.length} заказ(ов)\nСохранено (в обработке/ожидании/подтвержденных): ${protectedOrders.length} заказ(ов)`)) {
            const deletedCount = ordersToDelete.length;
            // Оставляем только заказы в обработке, ожидании и подтвержденные
            orders = protectedOrders;
            localStorage.setItem('orders', JSON.stringify(orders));
            
            showToast(`Удалено заказов: ${deletedCount}`, 'success', 3000);
            
            // Обновляем отображение заказов, если пользователь на странице заказов
            if (currentPage === 'orders') {
                showOrders();
            } else {
                showSettings();
            }
        }
    }
}

// Получить процент вознаграждения в зависимости от количества рефералов
window.getReferralPercentage = function(totalReferrals) {
    if (totalReferrals >= 0 && totalReferrals <= 5) {
        return 2;
    } else {
        return 5;
    }
}

// Получить реферальную ссылку в формате Telegram Mini App
window.getReferralLink = function() {
    const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    const userId = user?.id || 'user';
    
    // Формируем ссылку в формате: https://t.me/BOT_USERNAME/belvapeshop?startapp=REF_CODE
    // Это откроет модальное окно с мини-приложением, как в примере
    const botUsername = BOT_USERNAME || 'VapeBelShop_bot'; // Используем константу или fallback
    return `https://t.me/${botUsername}/belvapeshop?startapp=USER_${userId}`;
}

// Копировать реферальную ссылку
window.copyReferralLink = function() {
    const referralLink = getReferralLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(referralLink).then(() => {
            showToast('Ссылка скопирована!', 'success', 3000);
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }).catch(() => {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = referralLink;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('Ссылка скопирована!', 'success', 3000);
            } catch (err) {
                showToast('Не удалось скопировать ссылку', 'error', 3000);
            }
            document.body.removeChild(textArea);
        });
    } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = referralLink;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Ссылка скопирована!', 'success', 3000);
        } catch (err) {
            showToast('Не удалось скопировать ссылку', 'error', 3000);
        }
        document.body.removeChild(textArea);
    }
}

// Поделиться реферальной ссылкой - открывает панель выбора чатов
window.shareReferralLink = function() {
    const referralLink = getReferralLink();
    const shareText = `Присоединяйся к VAPESHOP! Используй мою реферальную ссылку и получай бонусы: ${referralLink}`;
    
    // Сразу открываем панель выбора чатов через Telegram API
    if (tg && tg.shareUrl) {
        // shareUrl открывает нативную панель выбора чатов/контактов в Telegram
        tg.shareUrl(referralLink, shareText);
    } else if (tg && tg.openTelegramLink) {
        // Альтернативный способ через открытие ссылки Telegram
        const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
        tg.openTelegramLink(telegramShareUrl);
    } else if (navigator.share) {
        // Нативный share API (открывает панель выбора контактов/чатов)
        navigator.share({
            title: 'VAPESHOP - Реферальная ссылка',
            text: shareText,
            url: referralLink
        }).catch(() => {
            // Если пользователь закрыл окно, ничего не делаем
        });
    } else {
        // Fallback - копируем ссылку
        copyReferralLink();
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Показать страницу рефералов
function showReferrals() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
    const userId = user?.id || 'user';
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    const referralLink = getReferralLink();
    const referralPercentage = getReferralPercentage(referralsData.total || 0);
    const activeReferrals = referralsData.active || 0;
    const totalReferrals = referralsData.total || 0;
    
    container.innerHTML = `
        <!-- Пригласительная ссылка -->
        <div style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'});">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getUsersIcon('#007AFF')}</span>
                <span>Пригласительная ссылка</span>
            </div>
            
            <div style="background: ${darkMode ? colors.bgSecondary : '#f8f9fa'}; padding: 12px; border-radius: 12px; margin-bottom: 12px; border: 1px solid ${colors.border}; position: relative;">
                <div style="font-size: 12px; color: ${colors.textSecondary}; margin-bottom: 6px;">Ваша ссылка:</div>
                <div style="font-size: 13px; font-weight: 600; color: ${colors.text}; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${referralLink}</div>
                <button onclick="copyReferralLink()" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; padding: 0; border: none; background: ${colors.bgCard}; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Скопировать ссылку">
                    ${getCopyIcon(colors.textSecondary).replace('width="20" height="20"', 'width="14" height="14"')}
                </button>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button onclick="copyReferralLink()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); transition: all 0.2s;" onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(0, 122, 255, 0.4)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0, 122, 255, 0.3)'">
                    <span style="width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">${getCopyIcon('#ffffff').replace('width="20" height="20"', 'width="18" height="18"')}</span>
                    <span>Копировать</span>
                </button>
                <button onclick="shareReferralLink()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3); transition: all 0.2s;" onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(76, 175, 80, 0.4)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(76, 175, 80, 0.3)'">
                    <span style="width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">${getShareIcon('#ffffff').replace('width="24" height="24"', 'width="18" height="18"')}</span>
                    <span>Поделиться</span>
                </button>
            </div>
        </div>
        
        <!-- Статистика -->
        <div style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'});">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getChartIcon('#007AFF')}</span>
                <span>Статистика</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                <div style="background: ${darkMode ? colors.bgSecondary : '#f8f9fa'}; padding: 16px; border-radius: 12px; text-align: center; border: 1px solid ${colors.border};">
                    <div style="font-size: 24px; font-weight: 700; color: ${colors.text}; margin-bottom: 4px;">${totalReferrals}</div>
                    <div style="font-size: 12px; color: ${colors.textSecondary};">Всего рефералов</div>
                </div>
                <div style="background: ${darkMode ? colors.bgSecondary : '#f8f9fa'}; padding: 16px; border-radius: 12px; text-align: center; border: 1px solid ${colors.border};">
                    <div style="font-size: 24px; font-weight: 700; color: ${colors.text}; margin-bottom: 4px;">${activeReferrals}</div>
                    <div style="font-size: 12px; color: ${colors.textSecondary};">Активных</div>
                </div>
            </div>
            
            <div style="background: linear-gradient(135deg, #FF9800 0%, #FF6B00 100%); padding: 16px; border-radius: 12px; text-align: center; color: white;">
                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Процент вознаграждения</div>
                <div style="font-size: 32px; font-weight: 700;">${referralPercentage}%</div>
            </div>
        </div>
        
        <!-- Как это работает -->
        <div style="background: linear-gradient(135deg, ${darkMode ? '#1a1a2e' : '#f8f9fa'} 0%, ${darkMode ? '#16213e' : '#ffffff'} 100%); padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'});">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getInfoIcon('#007AFF')}</span>
                <span>Как это работает</span>
            </div>
            
            <div style="color: ${colors.text}; font-size: 14px; line-height: 1.8;">
                <p style="margin-bottom: 16px; color: ${colors.text}; font-weight: 500;">Когда человек, которого вы привели по своей реферальной ссылке, сделает заказ в приложении и купит что-то, вы получите <strong style="color: #FF9800;">2 коина</strong> за первого приведенного пользователя.</p>
                
                <div style="background: ${darkMode ? 'rgba(0, 122, 255, 0.1)' : 'rgba(0, 122, 255, 0.05)'}; padding: 16px; border-radius: 12px; margin-top: 16px; border: 2px solid ${darkMode ? 'rgba(0, 122, 255, 0.3)' : 'rgba(0, 122, 255, 0.2)'};">
                    <div style="font-weight: 700; margin-bottom: 12px; color: ${colors.text}; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                        ${getChartIcon('#007AFF')}
                        <span>Процент вознаграждения:</span>
                    </div>
                    <div style="font-size: 13px; color: ${colors.text}; line-height: 1.8;">
                        <div style="margin-bottom: 8px; padding: 8px; background: ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)'}; border-radius: 8px;">• <strong style="color: ${colors.text};">0-5 рефералов:</strong> <span style="color: #007AFF; font-weight: 700;">2%</span></div>
                        <div style="padding: 8px; background: ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)'}; border-radius: 8px;">• <strong style="color: ${colors.text};">6+ рефералов:</strong> <span style="color: #007AFF; font-weight: 700;">5%</span></div>
                    </div>
                </div>
                
                <p style="margin-top: 16px; margin-bottom: 0; color: ${colors.text}; font-weight: 500;">Чем больше рефералов вы приведете, тем больше будет процент вознаграждения с каждого заказа!</p>
            </div>
        </div>
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Показать страницу помощи
function showHelp() {
    const container = document.getElementById('page-content');
    if (!container) return;
    
    const colors = getThemeColors();
    
    container.className = '';
    container.style.padding = '16px';
    container.style.background = colors.bg;
    container.style.color = colors.text;
    
    // Начальное состояние для анимации
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px)';
    
    container.innerHTML = `
        <!-- Навигация по разделам -->
        <div style="margin-bottom: 20px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none;">
            <div style="display: flex; gap: 8px; padding-bottom: 8px; min-width: max-content;">
                <button onclick="scrollToHelpSection('help-usage')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Приложение
                </button>
                <button onclick="scrollToHelpSection('help-payment')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Оплата
                </button>
                <button onclick="scrollToHelpSection('help-coins')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Коины
                </button>
                <button onclick="scrollToHelpSection('help-referrals')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Рефералы
                </button>
                <button onclick="scrollToHelpSection('help-favorites')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Избранное
                </button>
                <button onclick="scrollToHelpSection('help-orders')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Заказы
                </button>
                <button onclick="scrollToHelpSection('help-faq')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    FAQ
                </button>
                <button onclick="scrollToHelpSection('help-support')" style="padding: 10px 16px; background: ${colors.bgCard}; border: 2px solid ${colors.border}; border-radius: 12px; font-size: 13px; font-weight: 600; color: ${colors.text}; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,${darkMode ? '0.2' : '0.05'});" onmouseover="this.style.background='${darkMode ? colors.bgSecondary : '#f0f0f0'}'; this.style.borderColor='#007AFF';" onmouseout="this.style.background='${colors.bgCard}'; this.style.borderColor='${colors.border}';">
                    Поддержка
                </button>
            </div>
        </div>
        <style>
            div[style*="overflow-x: auto"]::-webkit-scrollbar {
                display: none;
            }
        </style>
        
        <!-- Как пользоваться приложением -->
        <div id="help-usage" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#007AFF')}</span>
                <span>Как пользоваться приложением</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как добавить товар в корзину:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Найдите товар в разделе "Ассортимент"<br>
                        • Нажмите на карточку товара<br>
                        • Выберите вкус и крепость (если доступно)<br>
                        • Нажмите кнопку "Добавить в корзину"
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как оформить заказ:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Перейдите в раздел "Корзина"<br>
                        • Выберите способ получения (самовывоз или доставка)<br>
                        • Укажите адрес и время получения<br>
                        • Выберите способ оплаты<br>
                        • Нажмите "Оформить заказ"
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Как выбрать способ доставки:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • В корзине выберите "Точка самовывоза" или "Доставка"<br>
                        • Для самовывоза: выберите точку из списка<br>
                        • Для доставки: укажите город и адрес доставки
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Оплата и доставка -->
        <div id="help-payment" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getMoneyIcon('#4CAF50')}</span>
                <span>Оплата и доставка</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Способы оплаты:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • <strong style="color: ${colors.text};">BYN</strong> - оплата денежными средствами<br>
                        • <strong style="color: ${colors.text};">Vape Coins</strong> - оплата внутренней валютой приложения
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как работает доставка:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Выберите город доставки (Минск или Могилев)<br>
                        • Укажите точный адрес доставки<br>
                        • Выберите удобное время доставки<br>
                        • Ожидайте звонка от курьера
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как выбрать время доставки:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • После выбора адреса нажмите на время доставки<br>
                        • Выберите день (Сегодня или Завтра)<br>
                        • Выберите временной интервал<br>
                        • Укажите точное время в интервале
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Точки самовывоза:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Доступны в разделе "Корзина"<br>
                        • Выберите удобную точку из списка<br>
                        • Укажите время получения заказа
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Vape Coins -->
        <div id="help-coins" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 24)}</span>
                <span>Vape Coins</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как получить Vape Coins:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Получайте коины за каждый полученный заказ<br>
                        • За каждые 10 BYN стоимости товара вы получаете 1 Vape Coin<br>
                        • Коины суммируются при покупке нескольких товаров
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как использовать коины:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • В корзине выберите способ оплаты "Коины"<br>
                        • Убедитесь, что у вас достаточно коинов<br>
                        • Оформите заказ с оплатой коинами
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">История транзакций:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Перейдите в раздел "Vape Coins"<br>
                        • Просмотрите историю начислений и трат<br>
                        • Нажмите на транзакцию для просмотра деталей заказа
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Реферальная программа -->
        <div id="help-referrals" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getUsersIcon('#007AFF')}</span>
                <span>Реферальная программа</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как приглашать друзей:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Перейдите в раздел "Рефералы"<br>
                        • Скопируйте свою реферальную ссылку<br>
                        • Поделитесь ссылкой с друзьями
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как работают проценты:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • 0-5 рефералов: 2% вознаграждения<br>
                        • 6+ рефералов: 5% вознаграждения
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Когда начисляются награды:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Когда ваш реферал сделает первый заказ<br>
                        • Вы получите 2 коина за первого реферала<br>
                        • Процент вознаграждения зависит от количества рефералов
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Избранное -->
        <div id="help-favorites" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getHeartFilledIcon('#ff4444')}</span>
                <span>Избранное</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как добавлять товары в избранное:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Откройте карточку товара<br>
                        • Нажмите на иконку сердца в правом верхнем углу<br>
                        • Товар будет добавлен в избранное
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Фильтры по категориям:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • В разделе "Избранное" используйте вкладки:<br>
                        • "Все товары" - показать все избранное<br>
                        • "Жидкость", "Расходник", "Одноразки", "Вейп" - фильтр по категориям
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Заказы -->
        <div id="help-orders" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getPackageIcon('#007AFF')}</span>
                <span>Заказы</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как отслеживать заказ:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Перейдите в раздел "Заказы" в профиле<br>
                        • Найдите нужный заказ в списке<br>
                        • Нажмите на заказ для просмотра деталей
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как отменить заказ:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Откройте заказ в статусе "В обработке"<br>
                        • Нажмите кнопку "Отменить заказ"<br>
                        • Подтвердите отмену<br>
                        • Коины (если использовались) будут возвращены
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Статусы заказов:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • <strong style="color: ${colors.text};">В обработке</strong> - заказ принят и готовится<br>
                        • <strong style="color: ${colors.text};">Заказ получен</strong> - заказ получен вами<br>
                        • <strong style="color: ${colors.text};">Заказ отменен</strong> - заказ был отменен
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Часто задаваемые вопросы -->
        <div id="help-faq" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getQuestionIcon('#007AFF')}</span>
                <span>Часто задаваемые вопросы</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Есть ли минимальная сумма заказа?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Минимальная сумма заказа не установлена. Вы можете заказать любое количество товаров.
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Какие сроки доставки?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Доставка осуществляется в день заказа или на следующий день в выбранное вами время.
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Можно ли изменить адрес доставки после оформления?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Если заказ еще в статусе "В обработке", вы можете отменить его и оформить новый с правильным адресом.
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как работает возврат товара?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Для возврата товара свяжитесь с нашей поддержкой. Возврат возможен в течение установленного срока при сохранении товарного вида.
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Есть ли гарантия на товары?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Все товары имеют гарантию производителя. Подробности уточняйте у продавца при получении заказа.
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Технические вопросы -->
        <div style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'});">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getSettingsIcon('#666666')}</span>
                <span>Технические вопросы</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Что делать, если приложение не загружается?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Проверьте подключение к интернету<br>
                        • Перезагрузите приложение<br>
                        • Очистите кэш браузера
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Как очистить кэш?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Перейдите в "Настройки" → "Очистка данных" → выберите нужный пункт.
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Как сбросить настройки?</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        В разделе "Настройки" вы можете очистить различные данные приложения. Будьте внимательны - это действие нельзя отменить.
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Контакты -->
        <div id="help-support" style="background: ${colors.bgCard}; padding: 20px; border-radius: 16px; margin-bottom: 16px; border: 2px solid ${colors.border}; box-shadow: 0 4px 12px rgba(0,0,0,${darkMode ? '0.3' : '0.08'}); scroll-margin-top: 20px;">
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: ${colors.text}; display: flex; align-items: center; gap: 8px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getInfoIcon('#007AFF')}</span>
                <span>Контакты и поддержка</span>
            </div>
            <div style="color: ${colors.textSecondary}; font-size: 14px; line-height: 1.8;">
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Связаться с поддержкой:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        По всем вопросам обращайтесь в Telegram: @vapeshop_support
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <strong style="color: ${colors.text};">Часы работы:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        Пн-Вс: 9:00 - 00:00
                    </div>
                </div>
                <div>
                    <strong style="color: ${colors.text};">Если у вас возникли проблемы:</strong>
                    <div style="margin-top: 6px; padding-left: 12px;">
                        • Опишите проблему подробно<br>
                        • Укажите номер заказа (если применимо)<br>
                        • Приложите скриншоты (если возможно)
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Анимация появления контейнера
    setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 10);
}

// Функция для прокрутки к разделу помощи
window.scrollToHelpSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        const container = document.getElementById('page-content');
        if (container) {
            // Используем scrollIntoView для правильной прокрутки
            section.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            
            // Дополнительно устанавливаем отступ сверху
            setTimeout(() => {
                const containerRect = container.getBoundingClientRect();
                const sectionRect = section.getBoundingClientRect();
                if (sectionRect.top < containerRect.top + 20) {
                    container.scrollTop = container.scrollTop + (sectionRect.top - containerRect.top) - 20;
                }
            }, 100);
        }
        
        // Визуальная обратная связь - эффект подпрыгивания (более заметный и долгий)
        section.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        section.style.transform = 'translateY(-15px) scale(1.03)';
        
        setTimeout(() => {
            section.style.transform = 'translateY(0) scale(1)';
        }, 500);
        
        setTimeout(() => {
            section.style.transition = '';
        }, 1000);
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Купить за Vape Coins
function buyWithVapeCoins(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.vapeCoinsPrice) return;
    
    // Проверяем наличие товара
    const isInStock = product.inStock !== false && (product.quantity === undefined || product.quantity > 0);
    if (!isInStock) {
        showToast('Товар временно недоступен', 'error', 3000);
        return;
    }
    
    // Проверяем наличие достаточного количества коинов
    if (vapeCoins < product.vapeCoinsPrice) {
        showToast(`Недостаточно коинов\nНужно: ${product.vapeCoinsPrice.toFixed(1)}, у вас: ${vapeCoins.toFixed(1)}`, 'error', 3000);
        return;
    }
    
    // Подтверждение покупки
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '🪙 Покупка за Vape Coins',
            message: `Купить "${product.name}" за ${product.vapeCoinsPrice.toFixed(1)} Vape Coins?\n\nУ вас: ${vapeCoins.toFixed(1)} коинов\nПосле покупки: ${(vapeCoins - product.vapeCoinsPrice).toFixed(1)} коинов`,
            buttons: [
                {id: 'confirm', type: 'default', text: 'Купить'},
                {id: 'cancel', type: 'cancel', text: 'Отмена'}
            ]
        }, (btnId) => {
            if (btnId === 'confirm') {
                // Создаем заказ сначала, чтобы получить orderId
                const orderId = `order_vc_${Date.now()}`;
                
                // Списываем коины
                vapeCoins -= product.vapeCoinsPrice;
                localStorage.setItem('vapeCoins', vapeCoins.toString());
                
                // Вычисляем vapeCoinsPrice для товара
                const coinsPrice = calculateVapeCoinsPrice(product.price, product.vapeCoinsPrice);
                
                // Создаем заказ (как будто полученный)
                const order = {
                    id: orderId,
                    date: new Date().toISOString(),
                    status: 'received',
                    items: [{
                        ...product,
                        quantity: 1,
                        purchasedWithCoins: true,
                        paymentMethod: 'coins', // Указываем, что оплачено коинами
                        vapeCoinsPrice: coinsPrice
                    }],
                    location: currentLocation,
                    total: 0, // За Vape Coins
                    vapeCoinsSpent: product.vapeCoinsPrice
                };
                
                orders.unshift(order);
                localStorage.setItem('orders', JSON.stringify(orders));
                
                // Добавляем в историю транзакций с orderId
                vapeCoinsHistory.unshift({
                    id: `vc_${Date.now()}`,
                    date: new Date().toISOString(),
                    type: 'spent',
                    amount: -product.vapeCoinsPrice,
                    productId: product.id,
                    productName: product.name,
                    description: `Покупка: ${product.name}`,
                    orderId: orderId
                });
                localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
                
                // Обновляем профиль если открыт
                if (currentPage === 'profile') {
                    showProfile();
                }
                
                // Показываем успех
                showToast(`Товар куплен за ${product.vapeCoinsPrice.toFixed(1)} коинов\nОстаток: ${vapeCoins.toFixed(1)}`, 'success', 4000);
                            goBack();
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            }
        });
    } else {
        // Запасной вариант
        if (confirm(`Купить "${product.name}" за ${product.vapeCoinsPrice.toFixed(1)} Vape Coins?`)) {
            // Создаем заказ сначала, чтобы получить orderId
            const orderId = `order_vc_${Date.now()}`;
            
            // Вычисляем vapeCoinsPrice для товара
            const coinsPrice = calculateVapeCoinsPrice(product.price, product.vapeCoinsPrice);
            
            // Списываем коины
            vapeCoins -= product.vapeCoinsPrice;
            localStorage.setItem('vapeCoins', vapeCoins.toString());
            
            // Создаем заказ
            const order = {
                id: orderId,
                date: new Date().toISOString(),
                status: 'received',
                items: [{
                    ...product,
                    quantity: 1,
                    purchasedWithCoins: true,
                    paymentMethod: 'coins', // Указываем, что оплачено коинами
                    vapeCoinsPrice: coinsPrice
                }],
                location: currentLocation,
                total: 0,
                vapeCoinsSpent: product.vapeCoinsPrice
            };
            
            orders.unshift(order);
            localStorage.setItem('orders', JSON.stringify(orders));
            
            // Добавляем в историю с orderId
            vapeCoinsHistory.unshift({
                id: `vc_${Date.now()}`,
                date: new Date().toISOString(),
                type: 'spent',
                amount: -product.vapeCoinsPrice,
                productId: product.id,
                productName: product.name,
                description: `Покупка: ${product.name}`,
                orderId: orderId
            });
            localStorage.setItem('vapeCoinsHistory', JSON.stringify(vapeCoinsHistory));
            
            alert(`Товар куплен! Остаток: ${vapeCoins.toFixed(1)} коинов`);
                goBack();
        }
    }
}

// Показать детали заказа из истории Vape Coins
function showVapeCoinsOrderDetails(orderIdOrTransactionId) {
    // Сохраняем обработчик BackButton для восстановления
    let originalBackButtonHandler = null;
    if (tg && tg.BackButton) {
        originalBackButtonHandler = tg.BackButton.onClick;
        tg.BackButton.hide();
    }
    
    // Ищем заказ по ID
    let order = orders.find(o => o.id === orderIdOrTransactionId);
    
    // Если не нашли заказ напрямую, ищем транзакцию и по ней находим заказ
    if (!order) {
        const transaction = vapeCoinsHistory.find(t => t.id === orderIdOrTransactionId || t.orderId === orderIdOrTransactionId);
        if (transaction && transaction.orderId) {
            order = orders.find(o => o.id === transaction.orderId);
        }
    }
    
    if (!order) {
        if (tg && tg.showAlert) {
            tg.showAlert('Заказ не найден');
        }
        return;
    }
    
    const orderDate = new Date(order.date);
    const formattedDate = orderDate.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; opacity: 0; transition: opacity 0.3s ease;';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'background: white; padding: 24px; border-radius: 16px; max-width: 90%; width: 100%; max-width: 400px; max-height: 85vh; overflow-y: auto; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s ease, opacity 0.3s ease;';
    
    const closeModal = function() {
        // Восстанавливаем кнопку "Назад"
        if (tg && tg.BackButton && originalBackButtonHandler) {
            tg.BackButton.onClick(originalBackButtonHandler);
            // Показываем кнопку "Назад" если нужно
            if (currentPage && currentPage !== 'catalog' && currentPage !== 'cart' && currentPage !== 'favorites' && currentPage !== 'profile' && currentPage !== 'promotions') {
                tg.BackButton.show();
            }
        }
        
        // Плавное закрытие
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    };
    
    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e5e5;';
    
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;';
    title.innerHTML = `${getCoinIcon('#FF9800', 24)} <span>Детали покупки</span>`;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = getCrossIcon('#999').replace('width="24" height="24"', 'width="18" height="18"');
    closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: #999;';
    closeBtn.onclick = closeModal;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    modalContent.appendChild(header);
    
    // Определяем стили в зависимости от статуса
    const statusInfo = {
        'processing': {
            gradient: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
            color: '#FF9800',
            icon: '⏳',
            text: 'В обработке'
        },
        'cancelled': {
            gradient: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
            color: '#999',
            icon: '❌',
            text: 'Заказ отменен'
        },
        'received': {
            gradient: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
            color: '#4CAF50',
            icon: '✅',
            text: 'Заказ получен'
        }
    };
    
    const currentStatus = statusInfo[order.status] || statusInfo['processing'];
    
    // Информация о заказе
    const orderInfo = document.createElement('div');
    orderInfo.innerHTML = `
        <div style="background: ${currentStatus.gradient}; padding: 16px; border-radius: 12px; color: ${currentStatus.color}; margin-bottom: 16px; border: 2px solid ${currentStatus.color}20;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-size: 14px; opacity: 0.8; margin-bottom: 4px;">Номер заказа</div>
                    <div style="font-size: 18px; font-weight: 700;">#${order.id.slice(-6)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 24px; margin-bottom: 4px;">${currentStatus.icon}</div>
                    <div style="font-size: 12px; font-weight: 600;">${currentStatus.text}</div>
                </div>
            </div>
        </div>
        
        <div style="background: #f8f8f8; padding: 16px; border-radius: 12px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="font-size: 20px;">📅</span>
                <div style="flex: 1;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Дата и время</div>
                    <div style="font-weight: 600; color: #000;">${formattedDate}</div>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${order.deliveryType === 'delivery' ? getPackageIcon('#007AFF') : getLocationIcon('#007AFF')}</span>
                <div style="flex: 1;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                        ${order.deliveryType === 'delivery' ? 'Доставка' : 'Точка самовывоза'}
                    </div>
                    <div style="font-weight: 600; color: #000;">${order.deliveryType === 'selfPickup' ? (order.pickupLocation || 'Не указано') : (order.deliveryAddress || 'Не указано')}</div>
                    ${order.deliveryTime ? `
                        <div style="font-size: 12px; color: #666; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                            <span style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">${getClockIcon('#666')}</span>
                            <span>${typeof order.deliveryTime === 'string' && order.deliveryTime.includes('|') ? order.deliveryTime.split('|')[1] : order.deliveryTime}${order.deliveryExactTime ? ` (${order.deliveryExactTime})` : ''}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            ${order.vapeCoinsSpent ? `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getCoinIcon('#FF9800', 24)}</span>
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${order.status === 'cancelled' ? 'Было оплачено' : 'Оплачено'}</div>
                        <div style="font-weight: 600; color: #FF9800;">${order.vapeCoinsSpent.toFixed(1)} Vape Coins</div>
                        ${order.status === 'cancelled' ? `
                            <div style="font-size: 11px; color: #4CAF50; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                                <span style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center;">${getSuccessIcon('#4CAF50').replace('width="24" height="24"', 'width="12" height="12"')}</span>
                                <span>Коины возвращены</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            ${(() => {
                if (order.status === 'received') {
                    const transaction = vapeCoinsHistory.find(t => t.orderId === order.id && t.type === 'earned' && !t.cancelled);
                    if (transaction && transaction.amount > 0) {
                        return `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${getMoneyIcon('#4CAF50').replace('width="24" height="24"', 'width="24" height="24"')}</span>
                                <div style="flex: 1;">
                                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Начислено Vape Coins</div>
                                    <div style="font-weight: 600; color: #4CAF50; display: flex; align-items: center; gap: 4px;">+${getCoinIcon('#FF9800', 16)} ${transaction.amount.toFixed(1)}</div>
                                </div>
                            </div>
                        `;
                    }
                }
                return '';
            })()}
            
            ${order.status === 'cancelled' ? `
                <div style="padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 3px solid #ffc107; margin-top: 12px;">
                    <div style="font-size: 12px; color: #856404; line-height: 1.5;">
                        <strong>ℹ️ Заказ был отменен</strong><br>
                        ${order.vapeCoinsSpent > 0 ? 'Коины возвращены на ваш баланс.' : 'Вы можете выбрать другие товары.'}
                    </div>
                </div>
            ` : ''}
        </div>
        
        <div style="margin-bottom: 16px;">
            <div style="font-weight: 600; margin-bottom: 12px; font-size: 16px;">Товары:</div>
            ${order.items.map((item, idx) => `
                <div style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 12px; margin-bottom: 8px;">
                    <div style="display: flex; gap: 12px;">
                        <div style="width: 60px; height: 60px; background: #f8f8f8; border-radius: 8px; 
                            display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                            ${item.imageUrl ? `<img id="order-detail-img-${order.id}-${idx}" src="${item.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;" onerror="handleImageError('order-detail-img-${order.id}-${idx}')">` : getPackageIcon('#999')}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px; color: #000;">${item.name}</div>
                            ${item.flavor ? `<div style="font-size: 12px; color: #666; margin-bottom: 2px;">Вкус: ${item.flavor}</div>` : ''}
                            ${item.strength ? `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">Крепость: ${item.strength}</div>` : ''}
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                                <span style="font-size: 12px; color: #666;">Количество: ${item.quantity}</span>
                                <div style="text-align: right;">
                                    ${item.paymentMethod === 'coins' && item.vapeCoinsPrice ? `
                                        <span style="font-weight: 600; color: #FF9800; display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                                            ${getCoinIcon('#FF9800', 14)} ${(item.vapeCoinsPrice * item.quantity).toFixed(1)}
                                        </span>
                                        <div style="font-size: 10px; color: #999; margin-top: 2px;">Оплачено коинами</div>
                                    ` : item.price ? `
                                        <span style="font-weight: 600; color: #000; display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                                            ${(item.price * item.quantity).toFixed(2)} BYN
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div style="background: #f8f8f8; padding: 16px; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #000;">Итого:</span>
                <span style="font-size: 20px; font-weight: 700; color: #FF9800;">
                    ${order.vapeCoinsSpent ? `${order.vapeCoinsSpent.toFixed(1)}` : `${order.total ? order.total.toFixed(2) : '0.00'} BYN`}
                </span>
            </div>
        </div>
    `;
    
    modalContent.appendChild(orderInfo);
    modal.appendChild(modalContent);
    
    // Устанавливаем обработчик BackButton после создания closeModal
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(function() {
            // Блокируем кнопку "Назад" - закрываем модальное окно
            closeModal();
        });
    }
    
    // Блокируем прокрутку страницы
    const preventScroll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    modal.addEventListener('wheel', preventScroll, {passive: false});
    modal.addEventListener('touchmove', preventScroll, {passive: false});
    
    // Закрытие при клике на фон
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    }, true);
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Плавное появление модального окна
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Переключить избранное
// Проверка, есть ли товар в избранном (с учетом вкуса и крепости)
function isFavorite(productId, flavor = null, strength = null) {
    // Нормализуем значения: null, undefined, 'null', '' -> null
    const normalizeValue = (val) => {
        if (val === null || val === undefined || val === 'null' || val === '') return null;
        return String(val);
    };
    
    const normalizedFlavor = normalizeValue(flavor);
    const normalizedStrength = normalizeValue(strength);
    
    return favorites.some(fav => {
        if (typeof fav === 'number' || typeof fav === 'string') {
            // Старый формат (только ID) - для обратной совместимости
            return fav == productId && !normalizedFlavor && !normalizedStrength;
        } else {
            // Новый формат (объект) - строгое сравнение
            const favFlavor = normalizeValue(fav.flavor);
            const favStrength = normalizeValue(fav.strength);
            return fav.productId == productId && 
                   favFlavor === normalizedFlavor && 
                   favStrength === normalizedStrength;
        }
    });
}

// Добавить/удалить из избранного с учетом вкуса и крепости
function toggleFavorite(productId, flavor = null, strength = null) {
    // Если viewingProduct не установлен, но мы находимся на странице товара, пытаемся найти товар
    if (!viewingProduct) {
        const product = products.find(p => p.id === productId);
        if (product) {
            viewingProduct = product;
        } else {
            return;
        }
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // ВСЕГДА используем ТЕКУЩИЕ выбранные значения из viewingProduct, а не переданные параметры
    // Это важно, потому что кнопка может иметь старые значения в onclick
    // Нормализуем значения: null, undefined, 'null', '' -> null
    const normalizeValue = (val) => {
        if (val === null || val === undefined || val === 'null' || val === '') return null;
        return String(val);
    };
    
    // ВАЖНО: Используем ТЕКУЩИЕ значения из viewingProduct, а не переданные параметры
    // Переданные параметры могут быть устаревшими из шаблона
    const currentFlavor = normalizeValue(viewingProduct.selectedFlavor);
    const currentStrength = normalizeValue(viewingProduct.selectedStrength);
    
    // Ищем существующий элемент избранного - строгое сравнение с учетом null
    const existingIndex = favorites.findIndex(fav => {
        if (typeof fav === 'number' || typeof fav === 'string') {
            // Старый формат - только если нет вкуса и крепости
            return fav == productId && !currentFlavor && !currentStrength;
        } else {
            // Новый формат - сравниваем все поля строго
            const favFlavor = normalizeValue(fav.flavor);
            const favStrength = normalizeValue(fav.strength);
            return fav.productId == productId && 
                   favFlavor === currentFlavor && 
                   favStrength === currentStrength;
        }
    });
    
    const favoriteButton = document.getElementById(`favorite-btn-${productId}`);
    const heartIcon = document.getElementById(`heart-icon-${productId}`);
    
    if (existingIndex > -1) {
        // Удаляем из избранного
        favorites.splice(existingIndex, 1);
        
        // Синхронизируем с сервером через userDataManager
        if (window.userDataManager && window.userDataManager.updateUserData) {
            window.userDataManager.updateUserData({ favorites: favorites }).catch(err => {
                console.error('Ошибка синхронизации избранного:', err);
            });
        }
        
        localStorage.setItem('favorites', JSON.stringify(favorites));
        
        // Красивая анимация удаления сердечка
        if (favoriteButton && heartIcon) {
            // Шаг 1: Нажатие - уменьшаем
            favoriteButton.style.transform = 'scale(0.75)';
            heartIcon.style.transform = 'scale(0.8) rotate(-12deg)';
            favoriteButton.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease';
            heartIcon.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            
            // Шаг 2: Меняем иконку на пустую и увеличиваем
            setTimeout(() => {
                heartIcon.innerHTML = getHeartEmptyIcon('#999999');
                favoriteButton.style.borderColor = '#e5e5e5';
                favoriteButton.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.3s ease';
                heartIcon.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                favoriteButton.style.transform = 'scale(1.1)';
                heartIcon.style.transform = 'scale(1.2) rotate(12deg)';
                
                // Шаг 3: Легкая пульсация
                setTimeout(() => {
                    heartIcon.style.transform = 'scale(1.1) rotate(-8deg)';
                    
                    // Шаг 4: Возвращаем к нормальному состоянию
                    setTimeout(() => {
                        favoriteButton.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.3s ease';
                        heartIcon.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                        favoriteButton.style.transform = 'scale(1)';
                        heartIcon.style.transform = 'scale(1) rotate(0deg)';
                    }, 180);
                }, 180);
            }, 120);
        } else if (favoriteButton) {
            // Fallback для старых элементов
            favoriteButton.style.transform = 'scale(0.8)';
            setTimeout(() => {
                favoriteButton.innerHTML = getHeartEmptyIcon('#999999');
                favoriteButton.style.transform = 'scale(1)';
            }, 100);
        }
    } else {
        // Добавляем в избранное
        favorites.push({
            productId: productId,
            flavor: currentFlavor,
            strength: currentStrength
        });
        
        // Синхронизируем с сервером через userDataManager
        if (window.userDataManager && window.userDataManager.updateUserData) {
            window.userDataManager.updateUserData({ favorites: favorites }).catch(err => {
                console.error('Ошибка синхронизации избранного:', err);
            });
        }
        
        localStorage.setItem('favorites', JSON.stringify(favorites));
        
        // Красивая анимация заполнения сердечка с эффектом частиц
        if (favoriteButton && heartIcon) {
            // Шаг 1: Нажатие - уменьшаем с эффектом "нажатия"
            favoriteButton.style.transform = 'scale(0.75)';
            heartIcon.style.transform = 'scale(0.8)';
            favoriteButton.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            heartIcon.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
            
            // Шаг 2: Взрывное увеличение с заполнением
            setTimeout(() => {
                heartIcon.innerHTML = getHeartFilledIcon('#ff4444');
                favoriteButton.style.borderColor = '#ff4444';
                favoriteButton.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.3s ease';
                heartIcon.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                favoriteButton.style.transform = 'scale(1.2)';
                heartIcon.style.transform = 'scale(1.4) rotate(8deg)';
                
                // Создаем эффект частиц (маленькие сердечки)
                createHeartParticles(favoriteButton);
                
                // Шаг 3: Легкая пульсация
                setTimeout(() => {
                    heartIcon.style.transform = 'scale(1.25) rotate(-6deg)';
                    
                    // Шаг 4: Возврат с упругостью
                    setTimeout(() => {
                        favoriteButton.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.3s ease';
                        heartIcon.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                        favoriteButton.style.transform = 'scale(1)';
                        heartIcon.style.transform = 'scale(1) rotate(0deg)';
                        showToast('Товар добавлен в избранное', 'success', 2000);
                    }, 180);
                }, 180);
            }, 120);
        } else if (favoriteButton) {
            // Fallback для старых элементов
            favoriteButton.style.transform = 'scale(0.8)';
            favoriteButton.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            setTimeout(() => {
                favoriteButton.innerHTML = getHeartFilledIcon('#ff4444');
                favoriteButton.style.transform = 'scale(1.3)';
                setTimeout(() => {
                    favoriteButton.style.transform = 'scale(1)';
                    showToast('Товар добавлен в избранное', 'success', 2000);
                }, 200);
            }, 100);
        } else {
            showToast('Товар добавлен в избранное', 'success', 2000);
        }
    }
    
    // localStorage уже обновлен выше, не нужно дублировать
    
    // Обновляем состояние кнопки без перезагрузки страницы (чтобы не прерывать анимацию)
    // Не вызываем showProduct сразу, чтобы не прерывать анимацию
    // Если нужно обновить интерфейс, можно сделать это с задержкой после анимации
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// Копировать ID
function copyId(id) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(id);
    }
    if (tg && tg.showPopup) {
        tg.showPopup({
            title: '✅',
            message: 'ID скопирован',
            buttons: [{id: 'ok', type: 'default', text: 'OK'}]
        });
    }
}

// Создать эффект частиц при добавлении в избранное
function createHeartParticles(buttonElement) {
    const rect = buttonElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.innerHTML = getHeartFilledIcon('#ff4444');
        particle.style.position = 'fixed';
        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.width = '12px';
        particle.style.height = '12px';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '9999';
        particle.style.opacity = '0.8';
        particle.style.transform = 'scale(0.5)';
        particle.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        
        document.body.appendChild(particle);
        
        const angle = (Math.PI * 2 * i) / 6;
        const distance = 40 + Math.random() * 20;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        
        setTimeout(() => {
            particle.style.transform = `translate(${x}px, ${y}px) scale(0.3)`;
            particle.style.opacity = '0';
        }, 10);
        
        setTimeout(() => {
            particle.remove();
        }, 700);
    }
}

// Поделиться товаром - открывает панель выбора чатов
window.shareProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Формируем ссылку на товар в формате Telegram Mini App
    // Формат: https://t.me/BOT_USERNAME/belvapeshop?startapp=PRODUCT_123
    const botUsername = BOT_USERNAME || 'VapeBelShop_bot';
    const productUrl = `https://t.me/${botUsername}/belvapeshop?startapp=PRODUCT_${productId}`;
    
    // Формируем текст для пересылки
    const shareText = `Смотри, какой товар я нашел: ${product.name} - ${product.price.toFixed(2)} BYN\n\n${productUrl}`;
    
    // Сразу открываем панель выбора чатов через Telegram API
    if (tg && tg.shareUrl) {
        // shareUrl открывает нативную панель выбора чатов/контактов в Telegram
                        tg.shareUrl(productUrl, shareText);
    } else if (tg && tg.openTelegramLink) {
                        // Альтернативный способ через открытие ссылки Telegram
                        const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(productUrl)}&text=${encodeURIComponent(shareText)}`;
        tg.openTelegramLink(telegramShareUrl);
    } else if (navigator.share) {
        // Нативный share API (открывает панель выбора контактов/чатов)
            navigator.share({
                title: product.name,
                text: shareText,
                url: productUrl
            }).catch(() => {
            // Если пользователь закрыл окно, ничего не делаем
                    });
                } else {
        // Fallback - копируем ссылку
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(productUrl).then(() => {
                showToast('Ссылка скопирована!', 'success', 3000);
            });
        }
    }
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Делаем функции глобальными
window.goBack = goBack;
window.selectLocation = selectLocation;
window.showSortMenu = showSortMenu;
window.filterCategory = filterCategory;
window.searchProducts = searchProducts;
window.showProduct = showProduct;
window.selectStrength = selectStrength;
window.selectFlavor = selectFlavor;
window.showFlavorModal = showFlavorModal;
window.selectFlavorFromModal = selectFlavorFromModal;
window.addToCart = addToCart;
window.addToCartFromFavorites = addToCartFromFavorites;

// Добавить в корзину из избранного
function addToCartFromFavorites(productId, flavor = null, strength = null) {
    // Проверяем наличие товара
    const product = products.find(p => p.id == productId);
    if (!product) {
        showToast('Товар не найден', 'error', 2000);
        return;
    }
    
    // Преобразуем строки в null если они пустые
    const flavorValue = (flavor && flavor !== '' && flavor !== 'null') ? flavor : null;
    const strengthValue = (strength && strength !== '' && strength !== 'null') ? strength : null;
    
    // Проверяем наличие товара или конкретного вкуса на выбранной точке самовывоза
    let isInStock = false;
    if (flavorValue) {
        // Проверяем наличие конкретного вкуса
        isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isFlavorInStockAtLocation(product, flavorValue, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    } else {
        // Проверяем общее наличие товара
        isInStock = deliveryType === 'selfPickup' && selectedPickupLocation
            ? isProductInStockAtLocation(product, selectedPickupLocation)
            : (product.inStock !== false && (product.quantity === undefined || product.quantity > 0));
    }
    
    if (!isInStock) {
        const message = flavorValue 
            ? `На данной точке этого товара нет` 
            : 'На данной точке этого товара нет';
        showToast(message, 'error', 2000);
        return;
    }
    
    // Вызываем обычную функцию addToCart (она сама проверит наличие еще раз)
    addToCart(productId, strengthValue, flavorValue);
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}
window.changeQuantity = changeQuantity;
window.removeFromCart = removeFromCart;
window.removeFromFavorites = removeFromFavorites;
window.animateHeartRemoval = animateHeartRemoval;
window.setFavoritesCategory = setFavoritesCategory;
window.checkout = checkout;
window.toggleFavorite = toggleFavorite;
window.copyId = copyId;
window.shareProduct = shareProduct;
window.showSettings = showSettings;
window.toggleTheme = toggleTheme;
window.clearVapeCoinsHistory = clearVapeCoinsHistory;
window.clearCart = clearCart;
window.clearViewedProducts = clearViewedProducts;
window.clearFavorites = clearFavorites;
window.clearOrdersHistory = clearOrdersHistory;
window.showPage = showPage;
window.showOrders = showOrders;
window.clearOrdersByStatus = clearOrdersByStatus;
window.markOrderAsReceived = markOrderAsReceived;
window.cancelOrder = cancelOrder;
window.showVapeCoins = showVapeCoins;
window.buyWithVapeCoins = buyWithVapeCoins;
window.showVapeCoinsOrderDetails = showVapeCoinsOrderDetails;
window.showPromotions = showPromotions;
window.showLoyaltyProgramInfo = showLoyaltyProgramInfo;
window.setPaymentMethod = setPaymentMethod;
window.initSVGIcons = initSVGIcons;
window.handleImageError = handleImageError;
window.setDeliveryType = setDeliveryType;
window.selectCityForDelivery = selectCityForDelivery;
window.setDeliveryTime = setDeliveryTime;
window.selectDeliveryDay = selectDeliveryDay;
window.setDeliveryExactTime = setDeliveryExactTime;
window.selectPickupLocation = selectPickupLocation;
window.showTimeSelectionModal = showTimeSelectionModal;
window.showExactTimeSelectionModal = showExactTimeSelectionModal;
window.selectLocationFromMap = selectLocationFromMap;

// Запуск приложения
if (tg) {
    tg.ready();
    
    // Настраиваем кнопку "Назад" от Telegram
    if (tg.BackButton) {
        tg.BackButton.onClick(function() {
            goBack();
        });
    }
}

// Инициализация после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        init();
        handleKeyboard();
        // Инициализируем SVG иконки после загрузки DOM
        setTimeout(() => {
            initSVGIcons();
        }, 200);
    });
} else {
    init();
    handleKeyboard();
    // Инициализируем SVG иконки после загрузки DOM
    setTimeout(() => {
        initSVGIcons();
    }, 200);
}

// Обработка hash в URL для открытия товара по ссылке
window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#product=')) {
        const productId = parseInt(hash.replace('#product=', ''));
        if (productId && products.find(p => p.id === productId)) {
            showProduct(productId);
        }
    }
});

// Проверяем hash при загрузке страницы
if (window.location.hash && window.location.hash.startsWith('#product=')) {
    const productId = parseInt(window.location.hash.replace('#product=', ''));
    if (productId && products.find(p => p.id === productId)) {
        // Небольшая задержка, чтобы страница успела загрузиться
        setTimeout(() => {
            showProduct(productId);
        }, 500);
    }
}
