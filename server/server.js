const express = require('express');
const app = express();
const port = 3000;
const db = require('./database.js');
const webpush = require('web-push');

const vapidKeys = {
    publicKey: 'BFRmwol9jmURPv9P2Ls9L8wTkTwk32WgNJxy3vzAC6n1TVs5NRkMkkdm3u9F_sjz8aMlkW5k1Hkb0v87Y-JRbcY',
    privateKey: 'A815zL3cE74eWmvc5Pg6YBDkxn_QugV8Hd_wU4Rv1jo'
};

webpush.setVapidDetails(
    'mailto:your_email@example.com', // Replace with your email
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

app.use(express.static('public'));
app.use(express.json());

app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    db.run('INSERT INTO subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)', [endpoint, p256dh, auth], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(409).json({ error: 'Subscription already exists.' });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        res.status(201).json({ message: 'Subscription added.' });
    });
});

app.get('/api/events', (req, res) => {
    const { year, month } = req.query;
    const firstDay = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

    db.all('SELECT * FROM events WHERE date BETWEEN ? AND ?', [firstDay, lastDay], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/events', (req, res) => {
    const { date, title, user, time } = req.body;
    db.run('INSERT INTO events (date, title, user, time) VALUES (?, ?, ?, ?)', [date, title, user, time], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID });
    });
});

app.delete('/api/events/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM events WHERE id = ?', id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ deleted: this.changes });
    });
});

// Notification Logic
async function sendNotification(subscription, payload) {
    try {
        await webpush.sendNotification(subscription, payload);
        console.log('Notification sent to', subscription.endpoint);
    } catch (error) {
        console.error('Error sending notification:', error.stack);
        // If subscription is no longer valid, remove it from the database
        if (error.statusCode === 410) { // GONE status
            db.run('DELETE FROM subscriptions WHERE endpoint = ?', subscription.endpoint, (err) => {
                if (err) console.error('Error deleting expired subscription:', err.message);
                else console.log('Expired subscription deleted:', subscription.endpoint);
            });
        }
    }
}

async function checkAndSendNotifications() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toISOString().slice(0, 10);

    // Fetch all subscriptions once
    let subscriptions = [];
    try {
        subscriptions = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM subscriptions', (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(sub => ({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })));
            });
        });
    } catch (err) {
        console.error('Error fetching subscriptions:', err.message);
        return;
    }

    // 0:00 AM notification for today's events
    if (currentHour === 0 && currentMinute === 0) {
        db.all('SELECT * FROM events WHERE date = ?', [today], async (err, todayEvents) => {
            if (err) {
                console.error("Error fetching today's events:", err.message);
                return;
            }

            if (todayEvents.length > 0) {
                const payload = JSON.stringify({
                    title: '今日のイベント',
                    body: todayEvents.map(e => `${e.title} (${e.user})`).join(', '),
                    icon: '/icons/icon-192x192.png'
                });
                for (const sub of subscriptions) {
                    await sendNotification(sub, payload);
                }
            }
        });
    }

    // 15 minutes before event notification
    db.all('SELECT * FROM events WHERE date = ? AND time IS NOT NULL', [today], async (err, timedEvents) => {
        if (err) {
            console.error('Error fetching timed events:', err.message);
            return;
        }

        for (const event of timedEvents) {
            const [eventHour, eventMinute] = event.time.split(':').map(Number);
            const eventDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eventHour, eventMinute);
            const notificationTime = new Date(eventDateTime.getTime() - 15 * 60 * 1000); // 15 minutes before

            if (now.getTime() >= notificationTime.getTime() && now.getTime() < eventDateTime.getTime()) {
                const payload = JSON.stringify({
                    title: `まもなくイベント: ${event.title}`,
                    body: `${event.time}から ${event.title} (${event.user})`, 
                    icon: '/icons/icon-192x192.png'
                });
                for (const sub of subscriptions) {
                    await sendNotification(sub, payload);
                }
            }
        }
    });

    // End of day notification for next 7 days events (e.g., at 23:59)
    if (currentHour === 23 && currentMinute === 59) { // Or any specific end-of-day time
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(now.getDate() + 7);
        const sevenDaysLaterDate = sevenDaysLater.toISOString().slice(0, 10);

        db.all('SELECT * FROM events WHERE date > ? AND date <= ?', [today, sevenDaysLaterDate], async (err, upcomingEvents) => {
            if (err) {
                console.error('Error fetching upcoming events:', err.message);
                return;
            }

            if (upcomingEvents.length > 0) {
                const payload = JSON.stringify({
                    title: '今後のイベント (7日以内)',
                    body: upcomingEvents.map(e => `${e.date}${e.time ? ' ' + e.time : ''}: ${e.title} (${e.user})`).join(', '),
                    icon: '/icons/icon-192x192.png'
                });
                for (const sub of subscriptions) {
                    await sendNotification(sub, payload);
                }
            }
        });
    }
}

// Schedule notifications to run every minute for demonstration
// In a real application, you would use a more robust scheduler and specific times (e.g., 0:00 AM and end of day)
setInterval(checkAndSendNotifications, 60 * 1000); // Every minute

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
