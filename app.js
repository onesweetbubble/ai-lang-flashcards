const words = [
  { word: "apple", image: "https://upload.wikimedia.org/wikipedia/commons/1/15/Red_Apple.jpg" },
  { word: "dog", image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cute_dog.jpg" },
  { word: "car", image: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Toyota_car.jpg" }
];

let currentIndex = -1;

function nextCard() {
  currentIndex = (currentIndex + 1) % words.length;
  document.getElementById("word").textContent = "Translate this word";
  document.getElementById("wordImage").src = words[currentIndex].image;
  document.getElementById("feedback").textContent = "";
  document.getElementById("inputField").value = "";
}

function checkAnswer() {
  const input = document.getElementById("inputField").value.trim().toLowerCase();
  const correct = words[currentIndex].word.toLowerCase();
  if (input === correct) {
    document.getElementById("feedback").textContent = "✅ Correct!";
  } else {
    document.getElementById("feedback").textContent = "❌ Try again! The word was: " + correct;
  }
}

// Speech recognition (works in Chrome)
function startRecording() {
  if (!('webkitSpeechRecognition' in window)) {
    alert("Your browser does not support speech recognition.");
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.start();

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript.toLowerCase();
    document.getElementById("inputField").value = transcript;
    checkAnswer();
  };
}
