import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getDatabase, ref, push, onChildAdded, remove, get } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// =========================================================================
// !!! IMPORTANT !!! Replace these with your actual Firebase configuration
// =========================================================================
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY", 
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
    databaseURL: "YOUR_FIREBASE_DATABASE_URL",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// =========================================================================
// !!! IMPORTANT !!! Replace these with your actual Supabase configuration
// =========================================================================
const supabaseUrl = 'YOUR_SUPABASE_URL'; 
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'; 

let app;
let db;
let supabase;
let currentUser = null; 
const CHAT_PATH = 'your-chat-path-name'; // Replaced private name
const SUPABASE_BUCKET_NAME = 'your-bucket-name'; // Replaced private name

// --- DOM elements
const fileInput = document.getElementById('fileInput');
const fileIndicator = document.getElementById('file-indicator');
const messageInput = document.getElementById('message');
const modalOverlay = document.getElementById('confirmation-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const confirmBtn = document.getElementById('confirm-btn');
const cancelBtn = document.getElementById('cancel-btn');

let pendingAction = null;

// --- Firebase & Supabase Initialization ---
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log("Firebase Realtime Database initialized successfully.");

    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase client initialized successfully.");

    const storedUsername = localStorage.getItem('chatUsername');
    if (storedUsername) {
        currentUser = storedUsername;
        document.getElementById('loading').style.display = 'none';
        document.getElementById('chat').style.display = 'flex';
        document.getElementById('chatRoomName').textContent = `GENERAL CHAT`;
        document.getElementById('logoutButton').style.display = 'inline-block';
        document.getElementById('deleteAllButton').style.display = 'inline-block';
        listenMessages();
    } else {
        window.location.href = 'index.html';
    }
    
} catch (error) {
    console.error("Initialization Error:", error);
    document.getElementById('loading').textContent = "Failed to load chat. Check console for errors.";
    alert("Application initialization failed. Please check the browser console for details.");
}

// Expose functions globally for HTML onclick attributes
window.sendMessage = sendMessage;
window.deleteMessage = deleteMessage;
window.deleteAllMessages = deleteAllMessages;
window.logoutFromChat = logoutFromChat; 
window.confirmAction = confirmAction;
window.closeModal = closeModal;

// --- Event listener for file input change ---
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        fileIndicator.innerHTML = `
            <span>📎 ${fileName}</span>
            <button class="clear-file-btn">
                <span class="material-icons">close</span>
            </button>
        `;
        fileIndicator.classList.add('visible');
        messageInput.placeholder = 'Add a caption...';
        fileIndicator.querySelector('.clear-file-btn').addEventListener('click', () => {
            clearFileSelection();
        });

    } else {
        clearFileSelection();
    }
});

function clearFileSelection() {
    fileInput.value = '';
    fileIndicator.classList.remove('visible');
    messageInput.placeholder = 'Type a message';
}

function logoutFromChat() {
    showConfirmationModal(
        "Are you sure you want to log out?",
        () => {
            localStorage.removeItem('chatUsername');
            currentUser = null;
            window.location.href = 'index.html'; 
        }
    );
}

async function sendMessage() {
    if (!currentUser) { 
        showInfoModal("Please enter your name to send messages.");
        return;
    }

    const msgText = messageInput.value.trim();
    const file = fileInput.files[0];
    console.log("sendMessage called.");
    console.log("Message text:", msgText);
    console.log("Selected file object:", file);

    if (!msgText && !file) {
        showInfoModal('Please type a message or select a file to send.');
        return;
    }

    const chatRef = ref(db, `${CHAT_PATH}/messages`);
    let messageData = {
        user: currentUser, 
        timestamp: Date.now()
    };

    let tempDiv = null;

    if (file) {
        tempDiv = document.createElement('div');
        tempDiv.className = 'msg mine uploading';
        tempDiv.innerHTML = `${currentUser}: Uploading ${file.name}... <span class="spinner"></span>`;
        document.getElementById('messages').appendChild(tempDiv);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

        try {
            const filePath = `${file.name}_${Date.now()}`;
            console.log("Attempting file upload to Supabase:", filePath);

            const { data, error } = await supabase.storage
                .from(SUPABASE_BUCKET_NAME)
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                throw error;
            }

            const { data: publicUrlData } = supabase.storage
                .from(SUPABASE_BUCKET_NAME)
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;
            console.log("Supabase file upload successful. Public URL:", fileUrl);

            if (file.type.startsWith('image/')) {
                messageData.type = 'image';
            } else if (file.type.startsWith('video/')) {
                messageData.type = 'video';
            } else {
                messageData.type = 'file';
            }
            messageData.fileUrl = fileUrl;
            messageData.fileName = file.name;
            messageData.fileType = file.type;

            if (tempDiv) tempDiv.remove(); 

        } catch (error) {
            console.error("Error during Supabase file upload:", error);
            showInfoModal("Failed to upload file. Please try again.");
            if (tempDiv) tempDiv.remove(); 
            return;
        }
    }

    if (msgText) {
        if (!messageData.type) { 
            messageData.type = 'text';
        }
        messageData.text = msgText;
    } else if (file && !msgText) { 
        messageData.text = '';
    }

    try {
        await push(chatRef, messageData);
        console.log("Message data successfully pushed to Firebase RTDB:", messageData);
    } catch (error) {
        console.error("Error pushing message to Firebase RTDB:", error);
        showInfoModal("Failed to send message. Please try again.");
    }

    messageInput.value = '';
    clearFileSelection();
}

function listenMessages() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 

    const chatRef = ref(db, `${CHAT_PATH}/messages`);
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        const msgId = snapshot.key; 

        // New container to hold the name tag and the message bubble
        const msgContainer = document.createElement('div');
        msgContainer.className = 'msg-container new-message-animation' + (msg.user === currentUser ? ' mine' : '');
        
        // New element for the user's name tag
        const nameTag = document.createElement('div');
        nameTag.className = 'user-name-tag';
        nameTag.textContent = msg.user || "Unknown User";
        msgContainer.appendChild(nameTag);

        // The message bubble itself
        const div = document.createElement('div');
        div.className = 'msg';
        
        let content = '';

        switch (msg.type) {
            case 'text':
                content = `${msg.text}`;
                break;
            case 'image':
                content = `
                    ${msg.text ? msg.text + '<br>' : ''}
                    <a href="${msg.fileUrl}" target="_blank" download="${msg.fileName}" title="Click to download ${msg.fileName}">
                        <img src="${msg.fileUrl}" alt="${msg.fileName}" style="max-width: 100%; height: auto; border-radius: 8px; margin-top: 5px;">
                    </a>
                `;
                break;
            case 'video':
                content = `
                    ${msg.text ? msg.text + '<br>' : ''}
                    <a href="${msg.fileUrl}" target="_blank" download="${msg.fileName}" title="Click to download ${msg.fileName}">
                        <video controls style="max-width: 100%; height: auto; border-radius: 8px; margin-top: 5px;">
                            <source src="${msg.fileUrl}" type="${msg.fileType}">
                            Your browser does not support the video tag.
                        </video>
                    </a>
                `;
                break;
            case 'file':
                const icon = getFileIcon(msg.fileType || msg.fileName);
                content = `
                    ${msg.text ? msg.text + '<br>' : ''}
                    <a href="${msg.fileUrl}" target="_blank" download="${msg.fileName}" style="display: flex; align-items: center; gap: 5px; margin-top: 5px;">
                        ${icon} ${msg.fileName}
                    </a>
                `;
                break;
            default:
                content = `${msg.text || ' (Unknown message type)'}`;
        }

        div.innerHTML = content;
        msgContainer.appendChild(div);

        // Add event listener to the message bubble for deletion
        div.addEventListener('click', (event) => {
            if (event.target.tagName === 'A' || event.target.tagName === 'IMG' || event.target.tagName === 'VIDEO') {
                return;
            }
            document.querySelectorAll('.msg').forEach(m => m.classList.remove('selected'));
            div.classList.toggle('selected');
        });

        // Add delete button
        if (msg.user === currentUser) {
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<span class="material-icons">delete</span>';
            deleteButton.className = 'delete-btn';
            deleteButton.onclick = (event) => {
                event.stopPropagation();
                showConfirmationModal(
                    "Are you sure you want to delete this message?",
                    () => _deleteMessage(msgId, msg.fileUrl)
                );
            };
            div.appendChild(deleteButton);
        }

        messagesDiv.appendChild(msgContainer);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// --- Modal Logic ---
function showConfirmationModal(message, onConfirm) {
    modalTitle.textContent = "Confirm Action";
    modalMessage.textContent = message;
    confirmBtn.textContent = "Definitely";
    confirmBtn.style.display = "inline-block";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.display = "inline-block";
    pendingAction = onConfirm;
    modalOverlay.classList.add('show');
}

function showInfoModal(message) {
    modalTitle.textContent = "Attention";
    modalMessage.textContent = message;
    confirmBtn.textContent = "OK";
    confirmBtn.style.display = "inline-block";
    cancelBtn.style.display = "none";
    pendingAction = null;
    modalOverlay.classList.add('show');
}

function confirmAction() {
    if (pendingAction) {
        pendingAction();
    }
    closeModal();
}

function closeModal() {
    modalOverlay.classList.remove('show');
    pendingAction = null;
}

confirmBtn.addEventListener('click', confirmAction);
cancelBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (event) => {
    if (event.target === modalOverlay) {
        closeModal();
    }
});

async function _deleteMessage(messageId, fileUrl) {
    if (!currentUser) { 
        showInfoModal("You must be logged in to delete messages.");
        return;
    }
    
    try {
        const messageRef = ref(db, `${CHAT_PATH}/messages/${messageId}`);
        await remove(messageRef);
        console.log("Message deleted from Realtime Database:", messageId);

        if (fileUrl) {
            const urlParts = fileUrl.split('/public/');
            if (urlParts.length > 1) {
                const filePathInBucket = urlParts[1];
                const pathAfterBucket = filePathInBucket.substring(SUPABASE_BUCKET_NAME.length + 1);
                
                console.log("Attempting to delete file from Supabase:", pathAfterBucket);
                const { data, error } = await supabase.storage
                    .from(SUPABASE_BUCKET_NAME)
                    .remove([pathAfterBucket]);

                if (error) {
                    console.error("Error deleting file from Supabase Storage:", error);
                } else {
                    console.log("File deleted from Supabase Storage:", data);
                }
            } else {
                console.warn("Could not parse file URL for Supabase deletion:", fileUrl);
            }
        }
        document.getElementById('messages').innerHTML = ''; 
        listenMessages(); 
    } catch (error) {
        console.error("Error deleting message:", error);
        showInfoModal(`Failed to delete message: ${error.message}`);
    }
}

async function _deleteAllMessages() {
    if (!currentUser) { 
        showInfoModal("You must be logged in to delete all messages.");
        return;
    }

    try {
        const chatMessagesRef = ref(db, `${CHAT_PATH}/messages`);
        
        const snapshot = await get(chatMessagesRef); 
        const filePathsToDelete = [];

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const msg = childSnapshot.val();
                if (msg.fileUrl) {
                    const urlParts = msg.fileUrl.split('/public/');
                    if (urlParts.length > 1) {
                        const filePathInBucket = urlParts[1];
                        const pathAfterBucket = filePathInBucket.substring(SUPABASE_BUCKET_NAME.length + 1);
                        filePathsToDelete.push(pathAfterBucket); 
                    }
                }
            });
        }
        console.log("Files to delete from Supabase:", filePathsToDelete);

        await remove(chatMessagesRef);
        console.log("All messages deleted from Firebase Realtime Database.");

        if (filePathsToDelete.length > 0) {
            const { data, error } = await supabase.storage
                .from(SUPABASE_BUCKET_NAME)
                .remove(filePathsToDelete);

            if (error) {
                console.error("Error deleting files from Supabase Storage:", error);
                showInfoModal(`Failed to delete all files from storage: ${error.message}`);
            } else {
                console.log("File deleted from Supabase Storage:", data);
            }
        } else {
            console.log("No files to delete from Supabase Storage.");
        }

        document.getElementById('messages').innerHTML = '';
        showInfoModal("All messages and associated files have been deleted!");

    } catch (error) {
        console.error("Error deleting all messages:", error);
        showInfoModal(`Failed to delete all messages: ${error.message}`);
    }
}

function deleteMessage(messageId, fileUrl) {
    showConfirmationModal("Are you sure you want to delete this message?", () => _deleteMessage(messageId, fileUrl));
}

function deleteAllMessages() {
    showConfirmationModal("WARNING: Are you absolutely sure you want to delete ALL messages and associated files? This action cannot be undone.", _deleteAllMessages);
}

function getFileIcon(fileNameOrType) {
    if (fileNameOrType.includes('image')) return '🖼️';
    if (fileNameOrType.includes('video')) return '🎥';
    if (fileNameOrType.includes('audio')) return '🎵';
    if (fileNameOrType.includes('.pdf')) return '📄';
    if (fileNameOrType.includes('.doc') || fileNameOrType.includes('.docx')) return '📝';
    if (fileNameOrType.includes('.xls') || fileNameOrType.includes('.xlsx')) return '📊';
    if (fileNameOrType.includes('.ppt') || fileNameOrType.includes('.pptx')) return ' презентация';
    if (fileNameOrType.includes('.zip') || fileNameOrType.includes('.rar')) return '📦';
    return '📁';
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}