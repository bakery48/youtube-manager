// ===== データ構造 =====
const APP_DATA = {
    folders: [],
    channels: [],
    videos: [],
    settings: {
        clientId: '',
        apiKey: '',
        maxResults: 10
    },
    watchedVideos: new Set(),
    auth: {
        accessToken: null,
        expiresAt: null,
        userInfo: null
    }
};

// ===== 初期化 =====
let currentSortType = 'date-desc'; // デフォルトは新しい順

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initializeUI();
    updateAuthUI();
    renderFolders();
    renderVideos();
});

// ===== データの読み込み・保存 =====
function loadData() {
    const saved = localStorage.getItem('youtubeManagerData');
    if (saved) {
        const parsed = JSON.parse(saved);
        APP_DATA.folders = parsed.folders || [];
        APP_DATA.channels = parsed.channels || [];
        APP_DATA.videos = parsed.videos || [];
        APP_DATA.settings = parsed.settings || { clientId: '', apiKey: '', maxResults: 10 };
        APP_DATA.watchedVideos = new Set(parsed.watchedVideos || []);
        APP_DATA.auth = parsed.auth || { accessToken: null, expiresAt: null, userInfo: null };

        // トークンの有効期限チェック
        if (APP_DATA.auth.accessToken && APP_DATA.auth.expiresAt) {
            if (Date.now() > APP_DATA.auth.expiresAt) {
                APP_DATA.auth = { accessToken: null, expiresAt: null, userInfo: null };
            }
        }
    } else {
        // デフォルトフォルダを作成
        APP_DATA.folders = [
            { id: 'all', name: 'すべて', color: '#6366f1', isDefault: true },
            { id: 'favorites', name: 'お気に入り', color: '#f59e0b', isDefault: true }
        ];
        saveData();
    }
}

function saveData() {
    const data = {
        folders: APP_DATA.folders,
        channels: APP_DATA.channels,
        videos: APP_DATA.videos,
        settings: APP_DATA.settings,
        watchedVideos: Array.from(APP_DATA.watchedVideos),
        auth: APP_DATA.auth
    };
    localStorage.setItem('youtubeManagerData', JSON.stringify(data));
}

// ===== UI初期化 =====
function initializeUI() {
    // フォルダ追加ボタン
    document.getElementById('addFolderBtn').addEventListener('click', () => {
        openFolderModal();
    });

    // チャンネル追加ボタン
    document.getElementById('addChannelBtn').addEventListener('click', () => {
        openChannelModal();
    });

    // 設定ボタン
    document.getElementById('settingsBtn').addEventListener('click', () => {
        openSettingsModal();
    });

    // 更新ボタン
    document.getElementById('refreshBtn').addEventListener('click', () => {
        refreshVideos();
    });

    // 検索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterVideos(e.target.value);
    });

    // ソート
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        sortVideos(e.target.value);
    });

    // ビュー切り替え
    document.getElementById('viewGrid').addEventListener('click', () => {
        setView('grid');
    });
    document.getElementById('viewList').addEventListener('click', () => {
        setView('list');
    });

    // モーダルのクローズボタン
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    // モーダル外クリックで閉じる
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });

    // フォルダモーダルのボタン
    document.getElementById('saveFolderBtn').addEventListener('click', saveFolder);
    document.getElementById('cancelFolderBtn').addEventListener('click', closeAllModals);

    // チャンネルモーダルのボタン
    document.getElementById('saveChannelBtn').addEventListener('click', saveChannel);
    document.getElementById('cancelChannelBtn').addEventListener('click', closeAllModals);

    // 設定モーダルのボタン
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('cancelSettingsBtn').addEventListener('click', closeAllModals);

    // チャンネル管理モーダルのボタン
    document.getElementById('manageChannelsBtn').addEventListener('click', openManageChannelsModal);
    document.getElementById('closeManageChannelsBtn').addEventListener('click', closeAllModals);

    // ハンバーガーメニュー
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);

    // チャンネル同期ボタン
    document.getElementById('syncChannelsBtn').addEventListener('click', async () => {
        if (!APP_DATA.auth.accessToken) {
            alert('先にGoogleアカウントでログインしてください');
            return;
        }

        const btn = document.getElementById('syncChannelsBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🔄 同期中...';

        try {
            await fetchSubscriptions();
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

// ===== フォルダ関連 =====
let currentFolder = 'all';
let editingFolderId = null;

function renderFolders() {
    const folderList = document.getElementById('folderList');
    folderList.innerHTML = '';

    APP_DATA.folders.forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = `folder-item ${currentFolder === folder.id ? 'active' : ''}`;
        folderEl.innerHTML = `
            <div class="folder-color" style="background: ${folder.color}"></div>
            <div class="folder-name">${folder.name}</div>
            <div class="folder-count">${getVideosInFolder(folder.id).length}</div>
            ${!folder.isDefault ? `
                <div class="folder-actions">
                    <button class="icon-btn" onclick="editFolder('${folder.id}')" title="編集">✏️</button>
                    <button class="icon-btn" onclick="deleteFolder('${folder.id}')" title="削除">🗑️</button>
                </div>
            ` : ''}
        `;
        folderEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('icon-btn')) {
                selectFolder(folder.id);
            }
        });
        folderList.appendChild(folderEl);
    });

    // チャンネルフォルダセレクトも更新
    updateChannelFolderSelect();
}

function selectFolder(folderId) {
    currentFolder = folderId;
    renderFolders();
    renderVideos();

    const folder = APP_DATA.folders.find(f => f.id === folderId);
    document.getElementById('currentFolderName').textContent = folder ? folder.name : 'すべて';
}

function getVideosInFolder(folderId) {
    if (folderId === 'all') {
        return APP_DATA.videos;
    } else if (folderId === 'favorites') {
        return APP_DATA.videos.filter(v => v.isFavorite);
    } else {
        const channelsInFolder = APP_DATA.channels
            .filter(c => c.folderId === folderId)
            .map(c => c.id);
        return APP_DATA.videos.filter(v => channelsInFolder.includes(v.channelId));
    }
}

function openFolderModal(folderId = null) {
    editingFolderId = folderId;
    const modal = document.getElementById('folderModal');
    const title = document.getElementById('folderModalTitle');
    const nameInput = document.getElementById('folderNameInput');
    const colorInput = document.getElementById('folderColorInput');

    if (folderId) {
        const folder = APP_DATA.folders.find(f => f.id === folderId);
        title.textContent = 'フォルダを編集';
        nameInput.value = folder.name;
        colorInput.value = folder.color;
    } else {
        title.textContent = 'フォルダを追加';
        nameInput.value = '';
        colorInput.value = '#6366f1';
    }

    modal.classList.add('active');
}

function saveFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    const color = document.getElementById('folderColorInput').value;

    if (!name) {
        alert('フォルダ名を入力してください');
        return;
    }

    if (editingFolderId) {
        const folder = APP_DATA.folders.find(f => f.id === editingFolderId);
        folder.name = name;
        folder.color = color;
    } else {
        const newFolder = {
            id: 'folder_' + Date.now(),
            name,
            color,
            isDefault: false
        };
        APP_DATA.folders.push(newFolder);
    }

    saveData();
    renderFolders();
    closeAllModals();
}

function editFolder(folderId) {
    openFolderModal(folderId);
}

function deleteFolder(folderId) {
    if (confirm('このフォルダを削除しますか?')) {
        APP_DATA.folders = APP_DATA.folders.filter(f => f.id !== folderId);
        APP_DATA.channels.forEach(c => {
            if (c.folderId === folderId) {
                c.folderId = '';
            }
        });
        saveData();
        renderFolders();
        if (currentFolder === folderId) {
            selectFolder('all');
        }
    }
}

// ===== チャンネル関連 =====
function updateChannelFolderSelect() {
    const select = document.getElementById('channelFolderSelect');
    select.innerHTML = '<option value="">未分類</option>';

    APP_DATA.folders.forEach(folder => {
        if (!folder.isDefault) {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        }
    });
}

function openChannelModal() {
    if (!APP_DATA.settings.apiKey) {
        alert('先にYouTube Data APIキーを設定してください');
        openSettingsModal();
        return;
    }

    const modal = document.getElementById('channelModal');
    document.getElementById('channelUrlInput').value = '';
    document.getElementById('channelFolderSelect').value = currentFolder !== 'all' && currentFolder !== 'favorites' ? currentFolder : '';
    modal.classList.add('active');
}

async function saveChannel() {
    const input = document.getElementById('channelUrlInput').value.trim();
    const folderId = document.getElementById('channelFolderSelect').value;

    if (!input) {
        alert('チャンネルURLまたはIDを入力してください');
        return;
    }

    const channelId = extractChannelId(input);
    if (!channelId) {
        alert('有効なチャンネルURLまたはIDを入力してください');
        return;
    }

    // 既に追加済みかチェック
    if (APP_DATA.channels.find(c => c.id === channelId)) {
        alert('このチャンネルは既に追加されています');
        return;
    }

    try {
        const channelInfo = await fetchChannelInfo(channelId);
        const newChannel = {
            id: channelId,
            name: channelInfo.title,
            thumbnail: channelInfo.thumbnail,
            folderId: folderId || ''
        };

        APP_DATA.channels.push(newChannel);
        saveData();

        // 動画を取得
        await fetchChannelVideos(channelId);

        renderFolders();
        renderVideos();
        closeAllModals();
    } catch (error) {
        alert('チャンネル情報の取得に失敗しました: ' + error.message);
    }
}

function extractChannelId(input) {
    // チャンネルIDの場合
    if (input.startsWith('UC') && input.length === 24) {
        return input;
    }

    // URLの場合
    const patterns = [
        /youtube\.com\/channel\/(UC[\w-]{22})/,
        /youtube\.com\/@([\w-]+)/,
        /youtube\.com\/c\/([\w-]+)/,
        /youtube\.com\/user\/([\w-]+)/
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

// ===== YouTube API関連 =====
async function fetchChannelInfo(channelId) {
    const apiKey = APP_DATA.settings.apiKey;

    // @ハンドルの場合は検索APIを使用
    if (!channelId.startsWith('UC')) {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelId)}&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (!searchData.items || searchData.items.length === 0) {
            throw new Error('チャンネルが見つかりませんでした');
        }

        channelId = searchData.items[0].snippet.channelId;
    }

    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${channelId}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        throw new Error('チャンネルが見つかりませんでした');
    }

    const channel = data.items[0];
    return {
        id: channelId,
        title: channel.snippet.title,
        thumbnail: channel.snippet.thumbnails.default.url,
        uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads
    };
}

async function fetchChannelVideos(channelId) {
    const apiKey = APP_DATA.settings.apiKey;
    const maxResults = APP_DATA.settings.maxResults;

    let channel = APP_DATA.channels.find(c => c.id === channelId);

    // アップロードリストIDがない場合（古いデータや初回取得時）は取得する
    if (!channel.uploadsPlaylistId) {
        try {
            const info = await fetchChannelInfo(channelId);
            channel.uploadsPlaylistId = info.uploadsPlaylistId;
            // ついでに最新の情報に更新
            channel.name = info.title;
            channel.thumbnail = info.thumbnail;
            saveData();
        } catch (e) {
            console.error('Failed to update channel info:', e);
            return;
        }
    }

    const uploadsId = channel.uploadsPlaylistId;

    // playlistItems APIを使用 (コスト1)
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=${maxResults}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items) {
        return;
    }

    // 動画詳細(時間など)を取得 (コスト1)
    const videoIds = data.items.map(item => item.snippet.resourceId.videoId).join(',');
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    detailsData.items.forEach(video => {
        // 既存の動画は更新しない
        if (APP_DATA.videos.find(v => v.id === video.id)) {
            return;
        }

        const newVideo = {
            id: video.id,
            title: video.snippet.title,
            channelId: channelId,
            channelName: video.snippet.channelTitle,
            thumbnail: video.snippet.thumbnails.medium.url,
            publishedAt: video.snippet.publishedAt,
            duration: video.contentDetails.duration,
            isFavorite: false
        };

        APP_DATA.videos.push(newVideo);
    });

    saveData();
}

async function refreshVideos() {
    if (!APP_DATA.settings.apiKey) {
        alert('YouTube Data APIキーを設定してください');
        openSettingsModal();
        return;
    }

    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;
    const originalText = '🔄 更新';

    try {
        let count = 0;
        const total = APP_DATA.channels.length;

        for (const channel of APP_DATA.channels) {
            count++;
            refreshBtn.textContent = `更新中... (${count}/${total})`;

            await fetchChannelVideos(channel.id);
            // API制限対策: 200ms待機
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        renderVideos();
        alert('動画を更新しました');
    } catch (error) {
        alert('動画の更新に失敗しました: ' + error.message);
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = originalText;
    }
}

// ===== 動画表示関連 =====
function renderVideos() {
    const videoGrid = document.getElementById('videoGrid');
    const emptyState = document.getElementById('emptyState');

    let videos = getVideosInFolder(currentFolder);

    if (videos.length === 0) {
        videoGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    // ソートを適用
    switch (currentSortType) {
        case 'date-desc':
            videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
            break;
        case 'date-asc':
            videos.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
            break;
        case 'channel':
            videos.sort((a, b) => a.channelName.localeCompare(b.channelName));
            break;
    }

    videoGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    videoGrid.innerHTML = '';

    videos.forEach(video => {
        const videoCard = createVideoCard(video);
        videoGrid.appendChild(videoCard);
    });
}

function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const isWatched = APP_DATA.watchedVideos.has(video.id);
    const duration = formatDuration(video.duration);
    const publishedDate = formatDate(video.publishedAt);

    card.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="${video.title}">
            ${duration ? `<div class="video-duration">${duration}</div>` : ''}
            ${!isWatched ? '<div class="video-badge">NEW</div>' : ''}
        </div>
        <div class="video-info">
            <div class="video-title">${video.title}</div>
            <div class="video-channel">${video.channelName}</div>
            <div class="video-meta">
                <span>${publishedDate}</span>
            </div>
            <div class="video-actions">
                <button class="icon-btn" onclick="toggleFavorite('${video.id}')" title="${video.isFavorite ? 'お気に入り解除' : 'お気に入り'}">
                    ${video.isFavorite ? '⭐' : '☆'}
                </button>
                <button class="icon-btn" onclick="markAsWatched('${video.id}')" title="視聴済みにする">
                    ${isWatched ? '✅' : '☑️'}
                </button>
            </div>
        </div>
    `;

    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('icon-btn')) {
            openVideo(video.id);
        }
    });

    return card;
}

function openVideo(videoId) {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    if (isIOS || isAndroid) {
        // アプリ起動を試みるURLスキーム
        const appUrl = isIOS
            ? `youtube://watch?v=${videoId}`
            : `vnd.youtube:${videoId}`;

        // Web版のURL(フォールバック用)
        // const webUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // アプリ起動を試みる
        window.location.href = appUrl;

        // 自動フォールバックは削除 (アプリが入っているのにWeb版も開いてしまうため)
    } else {
        // PCの場合は新しいタブで開く
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }

    markAsWatched(videoId);
}

function toggleFavorite(videoId) {
    const video = APP_DATA.videos.find(v => v.id === videoId);
    if (video) {
        video.isFavorite = !video.isFavorite;
        saveData();
        renderFolders();
        renderVideos();
    }
}

function markAsWatched(videoId) {
    APP_DATA.watchedVideos.add(videoId);
    saveData();
    renderVideos();
}

function filterVideos(query) {
    const videoGrid = document.getElementById('videoGrid');
    const cards = videoGrid.querySelectorAll('.video-card');

    cards.forEach(card => {
        const title = card.querySelector('.video-title').textContent.toLowerCase();
        const channel = card.querySelector('.video-channel').textContent.toLowerCase();
        const searchQuery = query.toLowerCase();

        if (title.includes(searchQuery) || channel.includes(searchQuery)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

function sortVideos(sortType) {
    currentSortType = sortType;
    renderVideos();
}

function setView(viewType) {
    const gridBtn = document.getElementById('viewGrid');
    const listBtn = document.getElementById('viewList');
    const videoGrid = document.getElementById('videoGrid');

    if (viewType === 'grid') {
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        videoGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    } else {
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        videoGrid.style.gridTemplateColumns = '1fr';
    }
}



// ===== ユーティリティ =====
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function formatDuration(duration) {
    if (!duration) return '';

    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '';

    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');

    let result = '';
    if (hours) result += hours + ':';
    result += (minutes || '0').padStart(2, '0') + ':';
    result += (seconds || '0').padStart(2, '0');

    return result;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    if (diffDays < 7) return `${diffDays}日前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
    return `${Math.floor(diffDays / 365)}年前`;
}

// ===== OAuth認証関連 =====
let tokenClient = null;

function initializeOAuth() {
    const clientId = APP_DATA.settings.clientId;
    if (!clientId) return;

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        callback: handleAuthCallback
    });
}

function handleAuthCallback(response) {
    if (response.error) {
        console.error('OAuth Error:', response);
        alert('ログインに失敗しました: ' + response.error);
        return;
    }

    APP_DATA.auth.accessToken = response.access_token;
    APP_DATA.auth.expiresAt = Date.now() + (response.expires_in * 1000);

    saveData();
    fetchUserInfo();
}

async function fetchUserInfo() {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${APP_DATA.auth.accessToken}`
            }
        });
        const data = await response.json();

        APP_DATA.auth.userInfo = {
            name: data.name,
            email: data.email,
            picture: data.picture
        };

        saveData();
        updateAuthUI();

        // 登録チャンネルを自動取得
        await fetchSubscriptions();
    } catch (error) {
        console.error('Failed to fetch user info:', error);
    }
}

async function fetchSubscriptions() {
    if (!APP_DATA.auth.accessToken) return;

    try {
        let allSubscriptions = [];
        let nextPageToken = null;
        let pageCount = 0;
        let apiTotalResults = 0; // APIが返す総数

        // ページネーションで全チャンネルを取得
        do {
            pageCount++;

            // order=alphabeticalを追加して全件取得漏れを防ぐ
            const baseUrl = 'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&order=alphabetical&maxResults=50';
            const url = nextPageToken
                ? `${baseUrl}&pageToken=${nextPageToken}`
                : baseUrl;

            console.log(`ページ ${pageCount} をリクエスト中... URL: ${url}`);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${APP_DATA.auth.accessToken}`
                }
            });

            const data = await response.json();

            if (data.error) {
                console.error('API Error:', data.error);
                alert(`エラーが発生しました: ${data.error.message}`);
                return;
            }

            if (!data.items || data.items.length === 0) {
                if (pageCount === 1) {
                    alert('登録チャンネルが見つかりませんでした。\n(ブランドアカウントを使用している可能性があります)');
                }
                break;
            }

            // 初回ページで総数を取得
            if (pageCount === 1 && data.pageInfo) {
                apiTotalResults = data.pageInfo.totalResults;
                console.log(`API報告の総件数: ${apiTotalResults}`);
            }

            // 今回取得したチャンネル名をログに出力（デバッグ用）
            console.log(`ページ ${pageCount}: ${data.items.length}件取得`);

            // 次のトークン確認
            console.log(`NextToken: ${data.nextPageToken ? 'あり' : 'なし'}`);

            allSubscriptions = allSubscriptions.concat(data.items);
            nextPageToken = data.nextPageToken;

            // API制限対策: 次のページを取得する前に少し待機
            if (nextPageToken) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } while (nextPageToken);

        const beforeCount = APP_DATA.channels.length;
        let addedCount = 0;

        for (const item of allSubscriptions) {
            const channelId = item.snippet.resourceId.channelId;

            // 既に追加済みかチェック
            if (APP_DATA.channels.find(c => c.id === channelId)) {
                continue;
            }

            const newChannel = {
                id: channelId,
                name: item.snippet.title,
                thumbnail: item.snippet.thumbnails.default.url,
                folderId: ''
            };

            APP_DATA.channels.push(newChannel);
            addedCount++;
        }

        saveData();
        renderFolders();

        const totalCount = APP_DATA.channels.length;
        const message = `処理完了!\n` +
            `- API報告の総登録数: ${apiTotalResults}件\n` +
            `- 実際に取得できた数: ${allSubscriptions.length}件\n` +
            `- アプリ内の登録数: ${totalCount}件\n` +
            `(APIページ数: ${pageCount})`;

        alert(message);

        if (addedCount > 0) {
            // 動画を取得
            refreshVideos();
        }
    } catch (error) {
        console.error('Failed to fetch subscriptions:', error);
        alert('登録チャンネルの取得に失敗しました: ' + error.message);
    }
}

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (APP_DATA.auth.accessToken && APP_DATA.auth.userInfo) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userAvatar.src = APP_DATA.auth.userInfo.picture;
        userName.textContent = APP_DATA.auth.userInfo.name;
    } else {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
    }

    // ログインボタンのイベントリスナー
    loginBtn.onclick = () => {
        if (!APP_DATA.settings.clientId) {
            alert('先にOAuthクライアントIDを設定してください');
            openSettingsModal();
            return;
        }

        if (!tokenClient) {
            initializeOAuth();
        }

        tokenClient.requestAccessToken();
    };

    // ログアウトボタンのイベントリスナー
    logoutBtn.onclick = () => {
        if (confirm('ログアウトしますか?')) {
            APP_DATA.auth = {
                accessToken: null,
                expiresAt: null,
                userInfo: null
            };
            saveData();
            updateAuthUI();
        }
    };
}

// 設定保存を更新
function saveSettings() {
    const clientId = document.getElementById('clientIdInput').value.trim();
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const maxResults = parseInt(document.getElementById('maxResultsInput').value);

    APP_DATA.settings.clientId = clientId;
    APP_DATA.settings.apiKey = apiKey;
    APP_DATA.settings.maxResults = maxResults;

    saveData();

    // OAuthクライアントを再初期化
    if (clientId) {
        initializeOAuth();
    }

    closeAllModals();
}

// 設定モーダルを開く際にクライアントIDも表示
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    document.getElementById('clientIdInput').value = APP_DATA.settings.clientId;
    document.getElementById('apiKeyInput').value = APP_DATA.settings.apiKey;
    document.getElementById('maxResultsInput').value = APP_DATA.settings.maxResults;
    modal.classList.add('active');
}

// ===== チャンネル管理モーダル =====
function openManageChannelsModal() {
    const modal = document.getElementById('manageChannelsModal');
    renderChannelList();
    modal.classList.add('active');
}

function renderChannelList() {
    const container = document.getElementById('channelListContainer');
    container.innerHTML = '';

    if (APP_DATA.channels.length === 0) {
        container.innerHTML = '<p class="empty-hint">まだチャンネルが登録されていません</p>';
        return;
    }

    APP_DATA.channels.forEach(channel => {
        const channelItem = document.createElement('div');
        channelItem.className = 'channel-item';

        // チャンネルの動画数を取得
        const videoCount = APP_DATA.videos.filter(v => v.channelId === channel.id).length;

        // 現在のフォルダ名を取得
        const currentFolder = APP_DATA.folders.find(f => f.id === channel.folderId);
        const folderName = currentFolder ? currentFolder.name : '未分類';

        channelItem.innerHTML = `
            <img src="${channel.thumbnail}" alt="${channel.name}" class="channel-thumbnail">
            <div class="channel-info">
                <div class="channel-name">${channel.name}</div>
                <div class="channel-stats">動画: ${videoCount}件 | フォルダ: ${folderName}</div>
            </div>
            <select class="channel-folder-select" data-channel-id="${channel.id}">
                <option value="">未分類</option>
            </select>
            <div class="channel-actions">
                <button class="icon-btn" onclick="deleteChannel('${channel.id}')" title="削除">🗑️</button>
            </div>
        `;

        // フォルダオプションを追加
        const select = channelItem.querySelector('.channel-folder-select');
        APP_DATA.folders.forEach(folder => {
            if (!folder.isDefault) {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                if (channel.folderId === folder.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
        });

        // フォルダ変更イベント
        select.addEventListener('change', (e) => {
            changeChannelFolder(channel.id, e.target.value);
        });

        container.appendChild(channelItem);
    });
}

function changeChannelFolder(channelId, folderId) {
    const channel = APP_DATA.channels.find(c => c.id === channelId);
    if (channel) {
        channel.folderId = folderId;
        saveData();
        renderFolders();
        renderChannelList();

        // 現在のフォルダ表示を更新
        if (currentFolder !== 'all' && currentFolder !== 'favorites') {
            renderVideos();
        }
    }
}

function deleteChannel(channelId) {
    if (confirm('このチャンネルを削除しますか?\n(動画データも削除されます)')) {
        APP_DATA.channels = APP_DATA.channels.filter(c => c.id !== channelId);
        APP_DATA.videos = APP_DATA.videos.filter(v => v.channelId !== channelId);
        saveData();
        renderFolders();
        renderVideos();
        renderChannelList();
    }
}

// ===== サイドバー開閉 =====
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}
