const d = JSON.parse(new URLSearchParams(location.search).get('data') || '{}');
document.getElementById('repo').textContent = d.repo || '';
