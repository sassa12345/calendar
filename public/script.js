document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    const VAPID_PUBLIC_KEY = 'BFRmwol9jmURPv9P2Ls9L8wTkTwk32WgNJxy3vzAC6n1TVs5NRkMkkdm3u9F_sjz8aMlkW5k1Hkb0v87Y-JRbcY';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', async () => {
            if (!('Notification' in window)) {
                alert('このブラウザは通知をサポートしていません。');
                return;
            }

            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                console.log('通知許可が与えられました。');
                const registration = await navigator.serviceWorker.ready;
                const subscribeOptions = {
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                };
                const subscription = await registration.pushManager.subscribe(subscribeOptions);
                console.log('Push Subscription:', JSON.stringify(subscription));

                // Send subscription to your server
                await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(subscription),
                });
                alert('通知が有効になりました！');
            } else {
                alert('通知は拒否されました。');
            }
        });
    }

    const calendar = document.getElementById('calendar');
    const monthYearDisplay = document.getElementById('month-year-display');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const todayBtn = document.getElementById('today-btn');
    const addEventForm = document.getElementById('add-event-form');

    let currentDate = new Date();

    async function fetchEvents(year, month) {
        const response = await fetch(`/api/events?year=${year}&month=${month}`);
        return await response.json();
    }

    async function deleteEvent(eventId) {
        const response = await fetch(`/api/events/${eventId}`, {
            method: 'DELETE',
        });
        if (response.ok) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
        } else {
            alert('イベントの削除に失敗しました。');
        }
    }

    async function renderCalendar(year, month) {
        calendar.innerHTML = '';
        monthYearDisplay.textContent = `${year}年 ${month}月`;

        const events = await fetchEvents(year, month);
        const today = new Date();

        const firstDayOfMonth = new Date(year, month - 1, 1);
        const lastDayOfMonth = new Date(year, month, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, ...

        // Add day labels
        const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
        for (const dayLabel of dayLabels) {
            const dayLabelElement = document.createElement('div');
            dayLabelElement.classList.add('day-label');
            dayLabelElement.textContent = dayLabel;
            calendar.appendChild(dayLabelElement);
        }

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            calendar.appendChild(emptyCell);
        }

        // Add cells for each day of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const dayElement = document.createElement('div');
            dayElement.classList.add('day');

            const dayNumber = document.createElement('div');
            dayNumber.classList.add('day-number');
            dayNumber.textContent = i;
            dayElement.appendChild(dayNumber);

            if (year === today.getFullYear() && month === today.getMonth() + 1 && i === today.getDate()) {
                dayElement.classList.add('today');
            }

            const date = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === date);

            if (dayEvents.length > 0) {
                const eventsList = document.createElement('ul');
                eventsList.classList.add('events-list');
                dayEvents.forEach(event => {
                    const eventItem = document.createElement('li');
                    eventItem.classList.add('event-item');
                    eventItem.setAttribute('data-user', event.user);
                    eventItem.innerHTML = `${event.time ? event.time + ' ' : ''}${event.title} (${event.user}) <span class="delete-event" data-id="${event.id}">x</span>`;
                    eventsList.appendChild(eventItem);
                });
                dayElement.appendChild(eventsList);
            }

            calendar.appendChild(dayElement);
        }

        // Add event listeners to delete buttons
        const deleteButtons = document.querySelectorAll('.delete-event');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const eventId = e.target.dataset.id;
                if (window.confirm('このイベントを削除しますか？')) {
                    deleteEvent(eventId);
                }
            });
        });
    }

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    });

    todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    });

    addEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('event-date').value;
        const title = document.getElementById('event-title').value;
        const user = document.getElementById('event-user').value;
        const time = document.getElementById('event-time').value; // Get time value

        const response = await fetch('/api/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ date, title, user, time }), // Include time
        });

        if (response.ok) {
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
            addEventForm.reset();
        } else {
            alert('イベントの追加に失敗しました。');
        }
    });

    renderCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
});