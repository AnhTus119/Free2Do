let engagementChart;
let ratingChart;

function starMarkup(average) {
  const star = color => `<svg width="24" height="24" viewBox="0 0 24 24" fill="${color}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const row = color => `<div class="rating-stars-row">${star(color).repeat(5)}</div>`;
  return row('#E0E0E0') + `<div class="rating-stars-fill" style="width:${(average / 5) * 100}%">${row('#FBBC2E')}</div>`;
}

function drawCharts(analytics) {
  const labels = analytics.engagement_trend.map(point => point.label);
  const interactions = analytics.engagement_trend.map(point => point.interaction_count);
  const context = document.getElementById('engagementChart').getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(219,102,128,.2)');
  gradient.addColorStop(1, 'rgba(219,102,128,0)');
  engagementChart?.destroy();
  engagementChart = new Chart(context, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Lượt tương tác', data: interactions, borderColor: '#DB6680', backgroundColor: gradient, borderWidth: 2, fill: true, tension: .35 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
  });
  const counts = [5, 4, 3, 2, 1].map(rating => analytics.rating_distribution.find(item => item.rating === rating)?.count || 0);
  ratingChart?.destroy();
  ratingChart = new Chart(document.getElementById('ratingChart'), {
    type: 'bar', data: { labels: ['5 sao', '4 sao', '3 sao', '2 sao', '1 sao'], datasets: [{ data: counts, backgroundColor: '#F5B921', borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { grid: { display: false } } } }
  });
}

async function loadDashboard() {
  try {
    const { profile } = await BusinessAPI.requireBusiness();
    const days = Number(document.getElementById('chartPeriodSelect').value);
    const [dashboard, analytics] = await Promise.all([
      BusinessAPI.request('/business/dashboard'),
      BusinessAPI.request(`/business/analytics?days=${days}`)
    ]);
    document.getElementById('welcome-name').textContent = profile.business_name;
    document.getElementById('stat-total').textContent = BusinessAPI.formatNumber(dashboard.activity_count);
    document.getElementById('stat-active').textContent = BusinessAPI.formatNumber(dashboard.active_activity_count);
    document.getElementById('stat-bookmarks').textContent = BusinessAPI.formatNumber(dashboard.bookmark_count);
    document.getElementById('stat-rating').textContent = dashboard.average_rating == null ? '—' : dashboard.average_rating.toFixed(1);
    const average = analytics.summary.period_average_rating || 0;
    document.getElementById('ratingAvg').textContent = average ? average.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—';
    document.getElementById('ratingTotal').textContent = `(${analytics.summary.period_review_count} đánh giá trong kỳ)`;
    document.getElementById('ratingStars').innerHTML = starMarkup(average);
    drawCharts(analytics);
  } catch (error) {
    BusinessAPI.notify(error.message, 'error');
  }
}

window.updateChartData = loadDashboard;
document.addEventListener('DOMContentLoaded', loadDashboard);
