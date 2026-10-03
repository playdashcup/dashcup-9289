import { GLView } from "expo-gl";
import React, { Component } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
  Vibration,
  View,
  useColorScheme,
} from "react-native";

import GestureRecognizer, { swipeDirections } from "@/components/GestureView";
import Score from "@/components/ScoreText";
import Engine from "@/GameEngine";
import State from "@/state";
import CharacterSelectScreen from "@/screens/CharacterSelectScreen";
import GameOverScreen from "@/screens/GameOverScreen";
import HomeScreen from "@/screens/HomeScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import GameContext from "@/context/GameContext";
import AudioManager from "@/AudioManager";

const DEBUG_CAMERA_CONTROLS = false;

class Game extends Component {
  /// Reserve State for UI related updates...
  state = {
    ready: false,
    score: 0,
    viewKey: 0,
    gameState: State.Game.none,
    showSettings: false,
    showCharacterSelect: false,
    // gameState: State.Game.gameOver
  };

  transitionScreensValue = new Animated.Value(1);
  dashcupRun = null;
  dashcupParentOrigin = null;
  dashcupInputs = [];
  dashcupStartedAt = 0;

  onDashcupMessage = (event) => {
    if (event.source !== window.parent || event.origin !== this.dashcupParentOrigin) return;
    const message = event.data;
    if (message?.type === "dashcup:move") {
      const validDirections = [swipeDirections.SWIPE_UP, swipeDirections.SWIPE_DOWN, swipeDirections.SWIPE_LEFT, swipeDirections.SWIPE_RIGHT];
      if (this.state.gameState === State.Game.playing && validDirections.includes(message.key)) {
        this.onSwipe(message.key);
      }
      return;
    }
    if (message?.type === "dashcup:ping") {
      window.parent.postMessage({ type: "dashcup:ready" }, this.dashcupParentOrigin);
      return;
    }
    if (message?.type !== "dashcup:start" || typeof message.runId !== "string" || typeof message.runToken !== "string" || !Number.isSafeInteger(Number(message.seed))) return;
    // The parent retries until it receives this acknowledgement. A retry for
    // the active run must acknowledge without resetting the game or evidence.
    if (this.dashcupRun?.runId === message.runId) {
      window.parent.postMessage({ type: "dashcup:run_started", runId: message.runId }, this.dashcupParentOrigin);
      return;
    }
    this.dashcupRun = { runId: message.runId, runToken: message.runToken, seed: Number(message.seed) };
    this.dashcupInputs = [];
    this.dashcupStartedAt = performance.now();
    this.setState({ score: 0 }, () => {
      try {
        this.updateWithGameState(State.Game.playing);
        window.parent.postMessage({ type: "dashcup:run_started", runId: message.runId }, this.dashcupParentOrigin);
      } catch {
        this.dashcupRun = null;
        window.parent.postMessage({ type: "dashcup:run_start_error", runId: message.runId }, this.dashcupParentOrigin);
      }
    });
  };

  UNSAFE_componentWillReceiveProps(nextProps, nextState) {
    if (nextState.gameState && nextState.gameState !== this.state.gameState) {
      this.updateWithGameState(nextState.gameState, this.state.gameState);
    }
    if (this.engine && nextProps.character !== this.props.character) {
      this.engine._hero.setCharacter(nextProps.character);
    }
  }

  transitionToGamePlayingState = () => {
    Animated.timing(this.transitionScreensValue, {
      toValue: 0,
      useNativeDriver: true,
      duration: 200,
      onComplete: ({ finished }) => {
        this.engine.setupGame(this.props.character);
        this.engine.init();

        if (finished) {
          Animated.timing(this.transitionScreensValue, {
            toValue: 1,
            useNativeDriver: true,
            duration: 300,
          }).start();
        }
      },
    }).start();
  };

  updateWithGameState = (gameState) => {
    if (!gameState) throw new Error("gameState cannot be undefined");

    if (gameState === this.state.gameState) {
      return;
    }
    const lastState = this.state.gameState;

    this.setState({ gameState });
    this.engine.gameState = gameState;
    const { playing, gameOver, paused, none } = State.Game;
    switch (gameState) {
      case playing:
        if (lastState === paused) {
          this.engine.unpause();
        } else if (lastState !== none) {
          this.transitionToGamePlayingState();
        } else {
          // Coming straight from the menu.
          this.engine._hero.stopIdle();
          // Wait for React to commit `gameState`. The engine's input guard
          // reads this.state synchronously and drops moves before that commit.
          this.setState({ gameState }, () => this.onSwipe(swipeDirections.SWIPE_UP));
        }

        break;
      case gameOver:
        break;
      case paused:
        this.engine.pause();
        break;
      case none:
        if (lastState === gameOver) {
          this.transitionToGamePlayingState();
        }
        this.newScore();

        break;
      default:
        break;
    }
  };

  componentWillUnmount() {
    cancelAnimationFrame(this.engine.raf);
    if (Platform.OS === "web") window.removeEventListener("message", this.onDashcupMessage);
    // Dimensions.removeEventListener("change", this.onScreenResize);
  }

  async componentDidMount() {
    // AudioManager.sounds.bg_music.setVolumeAsync(0.05);
    // await AudioManager.playAsync(
    //   AudioManager.sounds.bg_music, true
    // );

    Dimensions.addEventListener("change", this.onScreenResize);
    if (Platform.OS === "web" && window.parent !== window) {
      const requestedOrigin = new URLSearchParams(window.location.search).get("parentOrigin");
      const allowedOrigins = ["https://dashcup.com", "https://www.dashcup.com", "https://staging.dashcup.com", "http://localhost:3000"];
      if (requestedOrigin && allowedOrigins.includes(requestedOrigin)) {
        this.dashcupParentOrigin = requestedOrigin;
        window.addEventListener("message", this.onDashcupMessage);
        window.parent.postMessage({ type: "dashcup:ready" }, this.dashcupParentOrigin);
      }
    }
  }

  onScreenResize = ({ window }) => {
    this.engine.updateScale();
  };

  UNSAFE_componentWillMount() {
    this.engine = new Engine();
    // this.engine.hideShadows = this.hideShadows;
    this.engine.onUpdateScore = (position) => {
      if (this.state.score < position) {
        this.setState({ score: position });
      }
    };
    this.engine.onGameInit = () => {
      this.setState({ score: 0 });
    };
    this.engine._isGameStateEnded = () => {
      return this.state.gameState !== State.Game.playing;
    };
    this.engine.onGameReady = () => this.setState({ ready: true });
    this.engine.onGameEnded = () => {
      if (this.dashcupRun && this.dashcupParentOrigin) {
        window.parent.postMessage({
          type: "dashcup:run_finished",
          runId: this.dashcupRun.runId,
          clientScore: this.state.score,
          durationMs: Math.max(1, Math.min(180000, Math.round(performance.now() - this.dashcupStartedAt))),
        }, this.dashcupParentOrigin);
        this.dashcupRun = null;
      }
      this.setState({ gameState: State.Game.gameOver });
      // this.props.navigation.navigate('GameOver')
    };
    this.engine.setupGame(this.props.character);
    this.engine.init();
  }

  newScore = () => {
    Vibration.cancel();
    // this.props.setGameState(State.Game.playing);
    this.setState({ score: 0 });
    this.engine.init();
  };

  onSwipe = (gestureName, userGesture = false) => {
    if (userGesture) AudioManager.unlockForUserGesture();
    if (this.dashcupRun && this.dashcupParentOrigin && this.dashcupInputs.length < 2000) {
      const directions = {
        [swipeDirections.SWIPE_UP]: "SWIPE_UP",
        [swipeDirections.SWIPE_DOWN]: "SWIPE_DOWN",
        [swipeDirections.SWIPE_LEFT]: "SWIPE_LEFT",
        [swipeDirections.SWIPE_RIGHT]: "SWIPE_RIGHT",
      };
      const key = directions[gestureName];
      if (key) {
        const input = { type: "move", key, at: Math.max(0, Math.min(180000, Math.round(performance.now() - this.dashcupStartedAt))) };
        this.dashcupInputs.push(input);
        window.parent.postMessage({ type: "dashcup:input", runId: this.dashcupRun.runId, input }, this.dashcupParentOrigin);
      }
    }
    this.engine.moveWithDirection(gestureName);
  };

  renderGame = () => {
    if (!this.state.ready) return;

    return (
      <GestureView
        pointerEvents={DEBUG_CAMERA_CONTROLS ? "none" : undefined}
        onStartGesture={this.engine.beginMoveWithDirection}
        onSwipe={this.onSwipe}
      >
        <GLView
          style={{ flex: 1, height: "100%", overflow: "hidden" }}
          onContextCreate={this.engine._onGLContextCreate}
        />
      </GestureView>
    );
  };

  renderGameOver = () => {
    // The embedded ChickenDash bridge owns failure controls. Suppress the
    // source game's unrelated offer/settings/share/leaderboard overlay.
    if (
      this.state.gameState !== State.Game.gameOver ||
      this.dashcupParentOrigin ||
      this.dashcupRun
    ) {
      return null;
    }

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <GameOverScreen
          showSettings={() => {
            this.setState({ showSettings: true });
          }}
          setGameState={(state) => {
            this.updateWithGameState(state);
          }}
        />
      </View>
    );
  };

  renderHomeScreen = () => {
    if (this.state.gameState !== State.Game.none) {
      return null;
    }

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <HomeScreen
          onPlay={() => {
            this.updateWithGameState(State.Game.playing);
          }}
          onShowCharacterSelect={() => {
            this.setState({ showCharacterSelect: true });
          }}
        />
      </View>
    );
  };

  renderSettingsScreen() {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <SettingsScreen
          goBack={() => this.setState({ showSettings: false })}
          setCharacter={this.props.setCharacter}
        />
      </View>
    );
  }

  renderCharacterSelectScreen() {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <CharacterSelectScreen
          navigation={{
            goBack: () => this.setState({ showCharacterSelect: false }),
          }}
          setCharacter={this.props.setCharacter}
        />
      </View>
    );
  }

  render() {
    const { isDarkMode, isPaused } = this.props;

    return (
      <View
        pointerEvents="box-none"
        style={[
          StyleSheet.absoluteFill,
          { flex: 1, backgroundColor: "#87C6FF" },
          Platform.select({
            web: { position: "fixed" },
            default: { position: "absolute" },
          }),
          this.props.style,
        ]}
      >
        <Animated.View
          style={{ flex: 1, opacity: this.transitionScreensValue }}
        >
          {this.renderGame()}
        </Animated.View>
        <Score
          score={this.state.score}
          gameOver={this.state.gameState === State.Game.gameOver}
        />
        {this.renderGameOver()}

        {this.renderHomeScreen()}

        {this.state.showSettings && this.renderSettingsScreen()}

        {this.state.showCharacterSelect && this.renderCharacterSelectScreen()}

        {isPaused && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(105, 201, 230, 0.8)",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          />
        )}
      </View>
    );
  }
}

const GestureView = ({ onStartGesture, onSwipe, ...props }) => {
  const config = {
    velocityThreshold: 0.2,
    directionalOffsetThreshold: 80,
  };

  return (
    <GestureRecognizer
      onResponderGrant={() => {
        onStartGesture();
      }}
      onSwipe={(direction) => {
        onSwipe(direction, true);
      }}
      config={config}
      onTap={() => {
        onSwipe(swipeDirections.SWIPE_UP, true);
      }}
      style={{ flex: 1 }}
      {...props}
    />
  );
};

function GameScreen(props) {
  const scheme = useColorScheme();
  const { character, setCharacter } = React.useContext(GameContext);

  return (
    <Game
      {...props}
      character={character}
      setCharacter={setCharacter}
      isDarkMode={scheme === "dark"}
    />
  );
}

export default GameScreen;
