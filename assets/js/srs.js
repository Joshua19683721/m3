/**
 * Spaced Repetition System (SRS) - SM-2 Algorithm Implementation
 * Based on SuperMemo 2 algorithm (used by Anki)
 * 
 * Key concepts:
 * - ease factor: starts at 2.5, min 1.3
 * - interval: days until next review
 * - reps: successful reviews count
 * - lapses: number of times forgotten
 * - due: next review date (timestamp)
 */

/**
 * SM-2 Algorithm Implementation
 * @param {Object} card - The card object with SRS fields
 * @param {number} quality - Quality of recall (0-5)
 *   0: Again (complete blackout)
 *   1: Hard (incorrect, but remembered with effort)
 *   2: Good (correct with difficulty)
 *   3: Easy (perfect recall)
 * @returns {Object} Updated card with new SRS values
 */
function srsReview(card, quality) {
    // Initialize SRS fields if not present
    if (card.ease === undefined) card.ease = 2.5;
    if (card.interval === undefined) card.interval = 0;
    if (card.reps === undefined) card.reps = 0;
    if (card.lapses === undefined) card.lapses = 0;
    if (card.due === undefined) card.due = Date.now();
    
    var now = Date.now();
    
    if (quality < 3) {
        // Failed - reset interval, increase lapses
        card.lapses = (card.lapses || 0) + 1;
        card.reps = 0;
        card.interval = 0;
        card.due = now; // Due immediately
    } else {
        // Success
        card.reps = (card.reps || 0) + 1;
        
        if (card.reps === 1) {
            card.interval = 1; // 1 day
        } else if (card.reps === 2) {
            card.interval = 6; // 6 days
        } else {
            card.interval = Math.round((card.interval || 1) * card.ease);
        }
        
        // Update ease factor based on quality
        // quality: 3=Again, 4=Hard, 5=Good, 6=Easy (but we use 0-5 scale)
        // SM-2: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
        // Our quality: 0=Again, 1=Hard, 2=Good, 3=Easy
        var q = quality + 3; // Map 0-3 to 3-6 for SM-2 formula
        var newEase = card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        card.ease = Math.max(1.3, newEase);
        
        // Schedule next review
        var intervalMs = card.interval * 24 * 60 * 60 * 1000; // days to ms
        card.due = Date.now() + intervalMs;
    }
    
    // Store last review time
    card.lastReview = Date.now();
    card.lastQuality = quality;
    
    return card;
}

/**
 * Get cards due for review
 * @param {Array} cards - Array of cards with due dates
 * @returns {Array} Cards due for review (due <= now)
 */
function getDueCards(cards) {
    var now = Date.now();
    return cards.filter(function(card) {
        return card.due && card.due <= Date.now();
    });
}

/**
 * Get cards sorted by due date (overdue first)
 * @param {Array} cards - Array of cards
 * @returns {Array} Sorted cards
 */
function sortByDue(cards) {
    return cards.slice().sort(function(a, b) {
        return (a.due || 0) - (b.due || 0);
    });
}

/**
 * Get review statistics
 * @param {Object} mistakes - state.mistakes object
 * @returns {Object} Statistics object
 */
function getReviewStats(mistakes) {
    var now = Date.now();
    var total = 0;
    var due = 0;
    var newCards = 0;
    var learning = 0;
    var review = 0;
    
    Object.keys(mistakes).forEach(function(k) {
        var card = mistakes[k];
        total++;
        
        if (!card.due || card.due <= Date.now()) {
            due++;
        }
        if (!card.reps || card.reps === 0) {
            newCards++;
        } else if (card.reps < 2) {
            learning++;
        } else {
            review++;
        }
    });
    
    return { total, due, new: newCards, learning, review };
}

/**
 * Get next review card (most overdue first)
 * @param {Object} mistakes - state.mistakes object
 * @returns {Object|null} Next card to review or null if none due
 */
function getNextReviewCard(mistakes) {
    var dueCards = [];
    Object.keys(mistakes).forEach(function(k) {
        var card = mistakes[k];
        if (card.due && card.due <= Date.now()) {
            dueCards.push({ key: k, card: card, overdue: Date.now() - card.due });
        }
    });
    
    if (dueCards.length === 0) return null;
    
    // Sort by most overdue first
    dueCards.sort(function(a, b) { return b.overdue - a.overdue; });
    return dueCards[0];
}

/**
 * Format time until due
 * @param {number} due - Due timestamp
 * @returns {string} Formatted time string
 */
function formatDue(due) {
    if (!due) return '—';
    var diff = due - Date.now();
    if (diff <= 0) return '現在複習';
    
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return days + ' 天後';
    if (hours > 0) return hours + ' 小時後';
    if (minutes > 0) return minutes + ' 分鐘後';
    return '剛剛';
}

function formatInterval(interval) {
    if (!interval) return '新卡片';
    if (interval < 1) return '今日';
    if (interval === 1) return '1 天';
    if (interval < 7) return interval + ' 天';
    if (interval < 30) return Math.round(interval / 7) + ' 週';
    if (interval < 365) return Math.round(interval / 30) + ' 個月';
    return Math.round(interval / 365) + ' 年';
}

function formatEase(ease) {
    return (ease || 2.5).toFixed(1);
}