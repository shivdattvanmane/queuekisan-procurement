document.addEventListener("DOMContentLoaded", function () {

    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");
    const sendButton = document.getElementById("sendButton");

    if (!chatInput || !sendButton || !chatMessages) {
        console.error("Chatbot elements not found.");
        return;
    }

    sendButton.addEventListener("click", function () {
        sendMessage();
    });

    chatInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    function sendMessage() {

        const message = chatInput.value.trim();

        if (message === "") {
            return;
        }

        const userMessage = document.createElement("div");

        userMessage.className = "message user-message";

        userMessage.innerHTML = `
            <div class="message-content">
                <p>${escapeHTML(message)}</p>
            </div>
        `;

        chatMessages.appendChild(userMessage);

        chatInput.value = "";

        scrollToBottom();

        setTimeout(function () {

            addBotMessage(
                "🌾 I received your question: <b>" +
                escapeHTML(message) +
                "</b><br><br>" +
                "The AI chatbot will be connected to your QueueKisan data in the next step."
            );

        }, 500);
    }

    function addBotMessage(message) {

        const botMessage = document.createElement("div");

        botMessage.className = "message bot-message";

        botMessage.innerHTML = `
            <div class="message-icon">🌾</div>

            <div class="message-content">
                <p>${message}</p>
            </div>
        `;

        chatMessages.appendChild(botMessage);

        scrollToBottom();
    }

    function sendSuggestion(question) {

        chatInput.value = question;

        sendMessage();
    }

    window.sendSuggestion = sendSuggestion;

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHTML(text) {

        const div = document.createElement("div");

        div.textContent = text;

        return div.innerHTML;
    }

});