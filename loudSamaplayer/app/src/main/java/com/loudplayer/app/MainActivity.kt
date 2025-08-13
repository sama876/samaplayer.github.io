package com.yourname.loudplayer

import android.media.MediaPlayer
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.yourname.loudplayer.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var mediaPlayer: MediaPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Load sample audio from res/raw/sample.mp3
        mediaPlayer = MediaPlayer.create(this, R.raw.sample)

        binding.playButton.setOnClickListener {
            mediaPlayer?.start()
        }

        binding.pauseButton.setOnClickListener {
            mediaPlayer?.pause()
        }

        binding.stopButton.setOnClickListener {
            mediaPlayer?.stop()
            mediaPlayer = MediaPlayer.create(this, R.raw.sample)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaPlayer?.release()
        mediaPlayer = null
    }
}
