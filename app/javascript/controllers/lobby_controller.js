import { Controller } from "@hotwired/stimulus"
import consumer from "channels/consumer"

export default class extends Controller {
  static values = {
    groupId: Number,
    userId: Number,
    startUrl: String,
    sessionPath: String,
    isHost: Boolean
  }

  connect() {
    console.log("connected")

    this.channel = consumer.subscriptions.create(
      {
        channel: "LobbyChannel",
        group_id: this.groupIdValue,
        user_session_id: this.userSessionIdValue,
        user_id: this.userIdValue
      },
      {
        received: this.received.bind(this)
      }
    )

    // Si je ne suis pas l'host, je demande la synchronisation
    if (!this.isHostValue) {
      setTimeout(() => {
        // Pause la musique en attendant la sync
        const audioEl = document.querySelector('[data-controller~="audio"]')
        if (audioEl) {
          const audioController = this.application.getControllerForElementAndIdentifier(audioEl, 'audio')
          if (audioController) audioController.pause()
        }
        // Demande la position actuelle au serveur
        this.channel.perform('request_sync', { user_id: this.userIdValue })
      }, 500)
    }

    // Écoute quand l'host lance la musique
    window.addEventListener('song-started', this.handleSongStarted.bind(this))
  }

  handleSongStarted(event) {
    // Seulement l'host envoie le signal de démarrage
    if (this.isHostValue) {
      this.channel.perform('song_started', {
        duration: event.detail.duration
      })
    }
  }

  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe()
    }
    window.removeEventListener('song-started', this.handleSongStarted.bind(this))
  }

  start() {
    fetch(`/groups/${this.groupIdValue}/start`, {
      method: "POST",
      headers: {
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ user_id: this.userIdValue })
    })
  }

  received(data) {
    console.log("Received:", data)

    if (data.type === 'user_joined') {
      const playersEl = document.getElementById('players')
      const existingPlayer = document.getElementById(`player_${data.user_id}`)

      if (playersEl && !existingPlayer) {
        playersEl.insertAdjacentHTML('beforeend', data.html)
      }
    }

    // NOUVEAU : Synchronisation de la musique
    if (data.type === 'sync_time') {
      // Seulement pour le joueur qui a demandé la sync
      if (data.user_id === this.userIdValue) {
        const audioEl = document.querySelector('[data-controller~="audio"]')
        if (audioEl) {
          const audioController = this.application.getControllerForElementAndIdentifier(audioEl, 'audio')
          if (audioController) {
            console.log(`Syncing to ${data.elapsed} seconds`)
            audioController.syncToTime(data.elapsed)
          }
        }
      }
    }

    if (data.type === 'video_paused') {
      const audioEl = document.querySelector('[data-controller~="audio"]')
      if (audioEl) {
        const audioController = this.application.getControllerForElementAndIdentifier(audioEl, 'audio')
        if (audioController) audioController.pause()
      }
    }

    if (data.type === 'video_playing') {
      const audioEl = document.querySelector('[data-controller~="audio"]')
      if (audioEl) {
        const audioController = this.application.getControllerForElementAndIdentifier(audioEl, 'audio')
        // ✅ CORRECTION : Ajout de gestion d'erreur pour mobile
        if (audioController) {
          audioController.play()  // Le catch est maintenant dans audio_controller.play()
        }
      }
    }

    if (data.type === "user_left") {
      const playerElement = document.getElementById(`player_${data.user_id}`)
      if (playerElement) {
        playerElement.remove()
      }
    }

    if (data.type === 'pseudo_updated') {
      const playerElement = document.getElementById(`player_${data.user_id}`)
      if (playerElement) {
        const nameElement = playerElement.querySelector('p')
        if (nameElement) {
          nameElement.textContent = data.display_name
        }
      }
    }

    if (data.type === 'buzzer_locked') {
      const buzzer = document.querySelector('[data-toggle-target="buzzer"]')
      const buzzerMessage = document.getElementById('buzzer-message')

      const audioEl = document.querySelector('[data-controller~="audio"]')
      if (audioEl) {
        const audioController = this.application.getControllerForElementAndIdentifier(audioEl, 'audio')
        if (audioController) audioController.pause()
      }

      // ← ICI : stopTimer est DEHORS du if/else, donc s'applique à tout le monde
      const counterEl = document.querySelector('[data-controller~="counter"]')
      if (counterEl) {
        const counterController = this.application.getControllerForElementAndIdentifier(counterEl, 'counter')
        if (counterController) counterController.stopTimer()
      }

      if (data.user_id === this.userIdValue) {
        // Je suis celui qui a buzzé, rien de spécial
      } else {
        if (buzzer) buzzer.classList.add('d-none')
        if (buzzerMessage) {
          buzzerMessage.textContent = `${data.user_id} is answering...`
          buzzerMessage.classList.remove('d-none')
        }
      }
    }

    if (data.type === 'buzzer_unlocked') {
      const buzzer = document.querySelector('[data-toggle-target="buzzer"]')
      const buzzerMessage = document.getElementById('buzzer-message')

      if (data.user_id !== this.userIdValue) {
        if (buzzer) buzzer.classList.remove('d-none')
      }
      if (buzzerMessage) buzzerMessage.classList.add('d-none')
    }

    if (data.type === 'round_won') {
      const buzzer = document.querySelector('[data-toggle-target="buzzer"]')
      const buzzerMessage = document.getElementById('buzzer-message')

      if (buzzer) buzzer.classList.add('d-none')
      if (buzzerMessage) {
        buzzerMessage.textContent = `Player ${data.user_id} got it right!`
        buzzerMessage.classList.remove('d-none')
      }
    }

    if (data.type === "start_game") {
      window.location = this.startUrlValue
    }

    if (data.type === 'next_question') {
      window.location = `${this.sessionPathValue}?current_question=${data.question_id}`
    }
    if (data.type === 'buzzer_partial') {
      const buzzer = document.querySelector('[data-toggle-target="buzzer"]')
      const buzzerMessage = document.getElementById('buzzer-message')

      if (data.user_id === this.userIdValue) {
        // Je suis celui qui a mal répondu → plus de buzzer pour moi
        if (buzzer) buzzer.classList.add('d-none')
      } else {
        // Les autres peuvent rebuzzer
        if (buzzer) buzzer.classList.remove('d-none')
        if (buzzerMessage) buzzerMessage.classList.add('d-none')
      }
    }
  }

  buzzerPressed() {
    this.channel.perform('buzzer_pressed', {
      user_id: this.userIdValue,
    })
  }

  answerWrong() {
    this.channel.perform('answer_wrong', {
      user_id: this.userIdValue
    })
  }

  answerCorrect() {
    this.channel.perform('answer_correct', {
      user_id: this.userIdValue
    })
  }

  goToNext(event) {
    event.preventDefault()
    const url = new URL(event.currentTarget.href)
    const questionId = url.searchParams.get('current_question')
    this.channel.perform('next_question', { question_id: questionId })
  }

  pauseVideo() {
    this.channel.perform('pause_video', { user_id: this.userIdValue })
  }

  playVideo() {
    this.channel.perform('play_video', { user_id: this.userIdValue })
  }
  answerPartial() {
    this.channel.perform('answer_partial', {
      user_id: this.userIdValue
    })
  }
}