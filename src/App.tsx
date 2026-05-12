import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Trophy, Navigation, Crosshair, LogIn, LogOut, User, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from './lib/supabase';

type GameStatus = 'menu' | 'playing' | 'teleporting' | 'boss_intro' | 'boss_fight' | 'victory' | 'dead';

export default function App() {
  const [fullscreen, setFullscreen] = useState(false);
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const [uiStatus, setUiStatus] = useState<GameStatus>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('waveDashHighScore') || '0', 10);
  });
  const [bossHp, setBossHp] = useState(100);
  const highScoreRef = useRef(highScore);

  // Supabase State
  const [user, setUser] = useState<any>(null);
  const userRef = useRef<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [displayUsername, setDisplayUsername] = useState('');
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'missing' | 'idle'>('idle');

  // Use a ref for input to read it instantly in the animation loop
  const inputRef = useRef({ 
    holding: false, 
    keys: {} as Record<string, boolean>,
    joystick: { active: false, startX: 0, startY: 0, curX: 0, curY: 0 } 
  });
  const bossImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = 'https://piurzgrhverbgaouhaan.supabase.co/storage/v1/object/sign/Christopherface/Screenshot_20260512_152421_WhatsApp.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hYjc4YzNiMC02MGFkLTQ5ZGEtYWNiMS00YjJhZmNhODFhNDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJDaHJpc3RvcGhlcmZhY2UvU2NyZWVuc2hvdF8yMDI2MDUxMl8xNTI0MjFfV2hhdHNBcHAuanBnIiwiaWF0IjoxNzc4NjA1OTYyLCJleHAiOjEwNjg0NDUxODUxNjJ9.g4tpt5R1qE4VX6KtOxt23cTx2jc0pgM5UZ8a8nmMW5U';
    img.onload = () => { bossImg.current = img; };

    // Supabase Auth Listener
    if (supabase) {
      setDbStatus('connected');
      fetchLeaderboard(); // Fetch initially for everyone

      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        userRef.current = session?.user ?? null;
        if (session?.user) {
          // Update username from metadata
          setDisplayUsername(session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'Pilot');
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        userRef.current = session?.user ?? null;
        if (session?.user) {
          setDisplayUsername(session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'Pilot');
        }
      });

      return () => subscription.unsubscribe();
    } else {
      setDbStatus('missing');
    }
  }, []);

  const fetchLeaderboard = async () => {
    if (!supabase) return;
    setIsLeaderboardLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setLeaderboard(data || []);
      setDbStatus('connected');
    } catch (err) {
      console.error("Leaderboard fetch error:", err);
      setDbStatus('error');
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const submitScore = async (finalScore: number) => {
    const currentUser = userRef.current;
    if (!supabase || !currentUser || finalScore <= 0) return;
    
    console.log("Attempting to submit score:", finalScore, "for user:", currentUser.id);
    
    // Fallback if displayUsername is stale
    const username = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Pilot';

    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .insert([
          { 
            user_id: currentUser.id, 
            username: username, 
            score: Math.floor(finalScore) 
          }
        ]);
      
      if (error) {
        console.error("Score submission error detail:", error);
        alert(`Fehler beim Speichern: ${error.message}\nCode: ${error.code}`);
      } else {
        console.log("Score submitted successfully:", data);
        fetchLeaderboard();
      }
    } catch (err) {
      console.error("Score submission exception:", err);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: { username: displayUsername }
          }
        });
        if (error) throw error;
        setAuthError('Check your email for confirmation!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setIsAuthModalOpen(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Auth failure');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const gameState = useRef({
    status: 'menu' as GameStatus,
    player: { x: 100, y: 300, size: 16 },
    trail: [] as { gx: number; gy: number }[],
    obstacles: [] as any[],
    particles: [] as any[],
    projectiles: [] as any[],
    boss: { x: 1200, y: 300, size: 100, hp: 100, maxHp: 100, vy: 3, nextAttack: 0, laserCharging: false, laserFrame: 0, laserTargetY: 0 },
    bossDefeatedCount: 0,
    nextBossScore: 50,
    speed: 2.5, // horizontal speed (starts slower)
    waveSpeed: 2.5, // vertical speed
    globalX: 0,
    score: 0,
    frames: 0,
    nextSpawn: 0,
    hue: 190, // color shifting
    teleportFrame: 0,
  });

  const setGameStatus = (status: GameStatus) => {
    gameState.current.status = status;
    setUiStatus(status);
  };

  const createParticles = (x: number, y: number, color: string, amount: number, speedModifier: number = 1) => {
    for (let i = 0; i < amount; i++) {
      gameState.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12 * speedModifier,
        vy: (Math.random() - 0.5) * 12 * speedModifier,
        life: 1,
        color,
      });
    }
  };

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameState.current = {
      ...gameState.current,
      status: 'playing',
      player: { x: window.innerWidth < 600 ? 60 : 150, y: canvas.height / 2, size: 16 },
      trail: [],
      obstacles: [],
      particles: [],
      projectiles: [],
      boss: { x: canvas.width + 200, y: canvas.height / 2, size: 100, hp: 100, maxHp: 100, vy: 4, nextAttack: 0, laserCharging: false, laserFrame: 0, laserTargetY: 0 },
      bossDefeatedCount: 0,
      nextBossScore: 50,
      speed: 2.5, // Even slower starting speed
      waveSpeed: 2.5,
      globalX: 0,
      score: 0,
      frames: 0,
      nextSpawn: canvas.width / 2, // initial empty space
      teleportFrame: 0,
      hue: 190,
    };
    
    setScore(0);
    setBossHp(100);
    setGameStatus('playing');
    inputRef.current.holding = false;
    inputRef.current.joystick.active = false;
    
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, []);

  const handleInputDown = (e: React.PointerEvent) => {
    // Only handle gameplay inputs if we are actually playing or in boss fight
    // This prevents background clicks from starting the game
    if (gameState.current.status === 'menu' || gameState.current.status === 'dead' || gameState.current.status === 'victory') {
      return;
    }
    inputRef.current.holding = true;

    // Start joystick on touch during boss fight
    if (gameState.current.status === 'boss_fight') {
      inputRef.current.joystick = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY
      };
    }
  };

  const handleInputMove = (e: React.PointerEvent) => {
    if (inputRef.current.joystick.active) {
      inputRef.current.joystick.curX = e.clientX;
      inputRef.current.joystick.curY = e.clientY;
    }
  };

  const handleInputUp = () => {
    inputRef.current.holding = false;
    inputRef.current.joystick.active = false;
  };

  const triggerTeleport = () => {
    setGameStatus('teleporting');
    gameState.current.teleportFrame = 0;
    // Clear obstacles
    gameState.current.obstacles = [];
  };

  const triggerBossIntro = () => {
    setGameStatus('boss_intro');
    const state = gameState.current;
    state.player.x = 150; // Reset player position for arena
    state.teleportFrame = 0;
    
    // Scale boss difficulty
    const difficultyMultiplier = 1 + (state.bossDefeatedCount * 0.5);
    state.boss.maxHp = 100 * difficultyMultiplier;
    state.boss.hp = state.boss.maxHp;
    state.boss.vy = 4 + (state.bossDefeatedCount * 0.5);
    
    setBossHp(100);
    state.projectiles = [];
  };

  const triggerDeath = () => {
    const state = gameState.current;
    if (state.status === 'dead' || state.status === 'victory') return;
    
    setGameStatus('dead');
    if (state.score > highScoreRef.current) {
      highScoreRef.current = Math.floor(state.score);
      setHighScore(highScoreRef.current);
      localStorage.setItem('waveDashHighScore', highScoreRef.current.toString());
    }
    submitScore(state.score);
    createParticles(state.player.x, state.player.y, '#ffffff', 40);
    createParticles(state.player.x, state.player.y, `hsl(${state.hue}, 100%, 60%)`, 20);
    
    inputRef.current.holding = false;
  };

  const triggerVictory = () => {
    const state = gameState.current;
    // Don't show victory UI, instead pulse and return to main game
    createParticles(state.boss.x, state.boss.y, '#f59e0b', 100, 2);
    createParticles(state.boss.x, state.boss.y, '#ef4444', 50, 2);
    
    state.score += 50; // Kill bonus
    state.bossDefeatedCount++;
    state.nextBossScore = Math.floor(state.score + 50);
    
    // Smooth transition back to playing
    setGameStatus('playing');
    state.boss.x = canvasRef.current!.width + 200;
    state.speed = Math.max(3, state.speed * 0.8); // slight speed reset but stay fast
    state.nextSpawn = 100;
    
    if (state.score > highScoreRef.current) {
      highScoreRef.current = Math.floor(state.score);
      setHighScore(highScoreRef.current);
      localStorage.setItem('waveDashHighScore', highScoreRef.current.toString());
    }
    setScore(Math.floor(state.score));
  };

  const gameLoop = () => {
    const state = gameState.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    state.frames++;
    const isHolding = inputRef.current.holding;
    const boundsPadding = 15;

    // -- UPDATE LOGIC --

    // Update Player position (always valid except when dead)
    if (state.status !== 'dead' && state.status !== 'menu' && state.status !== 'victory') {
      if (state.status === 'boss_fight') {
        // FREE 8-WAY MOVEMENT
        let dx = 0;
        let dy = 0;
        const keys = inputRef.current.keys;
        const moveSpeed = 6;

        // Keyboard
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        // Joystick (Mouse/Touch)
        if (inputRef.current.joystick.active) {
          const stick = inputRef.current.joystick;
          const stickDX = stick.curX - stick.startX;
          const stickDY = stick.curY - stick.startY;
          const dist = Math.sqrt(stickDX * stickDX + stickDY * stickDY);
          if (dist > 10) {
            dx = stickDX / dist;
            dy = stickDY / dist;
          }
        }

        if (dx !== 0 || dy !== 0) {
          const mag = Math.sqrt(dx * dx + dy * dy);
          state.player.x += (dx / mag) * moveSpeed;
          state.player.y += (dy / mag) * moveSpeed;
        }

        // Constraints
        state.player.x = Math.max(state.player.size + 10, Math.min(canvas.width - state.player.size - 10, state.player.x));
        state.player.y = Math.max(boundsPadding + state.player.size, Math.min(canvas.height - boundsPadding - state.player.size, state.player.y));

        // AUTO AIM SHOOTING
        if (state.frames % 12 === 0) {
          const angle = Math.atan2(state.boss.y - state.player.y, state.boss.x - state.player.x);
          state.projectiles.push({
            x: state.player.x,
            y: state.player.y,
            vx: Math.cos(angle) * 15,
            vy: Math.sin(angle) * 15,
            type: 'player_shot',
            color: '#22d3ee',
            size: 5
          });
        }
      } else {
        if (isHolding) {
          state.player.y -= state.waveSpeed;
        } else {
          state.player.y += state.waveSpeed;
        }

        // Constrain player to bounds
        if (state.player.y - state.player.size < boundsPadding) {
          state.player.y = boundsPadding + state.player.size;
          if (state.status === 'playing') triggerDeath();
        }
        if (state.player.y + state.player.size > canvas.height - boundsPadding) {
          state.player.y = canvas.height - boundsPadding - state.player.size;
          if (state.status === 'playing') triggerDeath();
        }
      }
    }

    if (state.status === 'playing') {
      state.score += 0.05;
      
      // GRADUAL SPEED INCREASE
      state.speed += 0.0012; 
      state.waveSpeed = state.speed; 
      
      const speedMultiplier = state.speed;
      state.globalX += speedMultiplier;

      // Trail recording
      state.trail.push({ gx: state.globalX + state.player.x, gy: state.player.y });
      state.trail = state.trail.filter((pt) => pt.gx - state.globalX > -20);

      // Check for recurring boss threshold
      if (state.score >= state.nextBossScore) {
        triggerTeleport();
      }

      // Obstacle Spawner
      if (state.nextSpawn <= 0) {
        const minGap = 130;
        const maxGap = Math.max(130, 280 - (state.speed - 3.5) * 30); 
        const gapSize = minGap + Math.random() * (maxGap - minGap);
        const gapY = boundsPadding + 20 + Math.random() * (canvas.height - boundsPadding * 2 - gapSize - 40);

        state.obstacles.push({
          x: canvas.width,
          w: 50,
          topH: gapY,
          bottomY: gapY + gapSize,
          passed: false,
        });

        state.nextSpawn = 200 + Math.random() * 150 + (state.speed * 10);
      }
      state.nextSpawn -= state.speed;

      // Obstacle Collision
      const inset = state.player.size * 0.7;
      const p = state.player;

      state.obstacles.forEach((obs) => {
        obs.x -= state.speed;

        if (p.x + inset > obs.x && p.x - inset < obs.x + obs.w) {
          if (p.y - inset < obs.topH || p.y + inset > obs.bottomY) {
            triggerDeath();
          }
        }

        if (!obs.passed && obs.x + obs.w < p.x - p.size) {
           obs.passed = true;
           state.hue = (state.hue + 30) % 360; 
        }
      });
      state.obstacles = state.obstacles.filter((o) => o.x + o.w > 0);

      if (state.frames % 10 === 0) setScore(Math.floor(state.score));
    }

    else if (state.status === 'teleporting') {
      state.teleportFrame++;
      state.speed *= 0.95; // Slow down horizontally
      state.globalX += state.speed;
      state.waveSpeed = Math.max(1.5, state.waveSpeed * 0.98); // Maintain some vertical control
      
      // Trail
      state.trail.push({ gx: state.globalX + state.player.x, gy: state.player.y });
      state.trail = state.trail.filter((pt) => pt.gx - state.globalX > -20);
      
      createParticles(state.player.x, state.player.y, '#a855f7', 2, 2);

      if (state.teleportFrame > 120) {
        triggerBossIntro();
      }
    }

    else if (state.status === 'boss_intro') {
      state.teleportFrame++;
      state.globalX += 1; // Slow constant movement
      state.trail = [];
      
      // Move boss into frame
      const targetBossX = canvas.width - 150;
      state.boss.x += (targetBossX - state.boss.x) * 0.05;

      if (state.teleportFrame > 100) {
        setGameStatus('boss_fight');
        state.boss.nextAttack = state.frames + 60;
      }
    }

    else if (state.status === 'boss_fight') {
      state.globalX += 2.5;
      
      // Boss vertical movement
      state.boss.y += state.boss.vy;
      if (state.boss.y < boundsPadding + state.boss.size / 2 || state.boss.y > canvas.height - boundsPadding - state.boss.size / 2) {
        state.boss.vy *= -1;
      }

      // BOSS ATTACK SELECTION
      if (state.frames > state.boss.nextAttack) {
        const attackType = Math.random();
        
        if (attackType < 0.4) {
          // Attack 1: Scatter burst
          for(let i=0; i<5; i++) {
            state.projectiles.push({
              x: state.boss.x, y: state.boss.y,
              vx: -7 - Math.random() * 3,
              vy: (Math.random() - 0.5) * 6,
              type: 'boss', color: '#f43f5e', size: 8
            });
          }
          state.boss.nextAttack = state.frames + 90;
        } else if (attackType < 0.7) {
          // Attack 2: Aimed Laser Charge
          state.boss.laserCharging = true;
          state.boss.laserTargetY = state.player.y;
          state.boss.laserFrame = 0;
          state.boss.nextAttack = state.frames + 140;
        } else {
          // Attack 3: Rapid shots
          const attackSpeed = Math.max(100, 200 - (state.bossDefeatedCount * 20));
          state.boss.nextAttack = state.frames + attackSpeed;
          for(let i=0; i<3; i++) {
            setTimeout(() => {
              if(state.status === 'boss_fight') {
                state.projectiles.push({
                  x: state.boss.x, y: state.boss.y,
                  vx: -12, vy: 0,
                  type: 'boss', color: '#fb7185', size: 12
                });
              }
            }, i * 200);
          }
        }
      }

      // LASER LOGIC
      if (state.boss.laserCharging) {
        state.boss.laserFrame++;
        if (state.boss.laserFrame > 60) {
          // Fire!
          if (state.boss.laserFrame < 90) {
            const distY = Math.abs(state.player.y - state.boss.laserTargetY);
            if (distY < 30 && state.player.x > 0) {
              triggerDeath();
            }
          } else {
            state.boss.laserCharging = false;
          }
        }
      }

      state.obstacles = state.obstacles.filter(o => o.x + (o.w || 0) > -50);

      // Projectile collision
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        if (p.type === 'boss') {
          const dx = p.x - state.player.x;
          const dy = p.y - state.player.y;
          if (Math.sqrt(dx*dx + dy*dy) < state.player.size + p.size - 4) {
             triggerDeath();
          }
        } else if (p.type === 'player_shot') {
          const dx = p.x - state.boss.x;
          const dy = p.y - state.boss.y;
          if (Math.sqrt(dx*dx + dy*dy) < state.boss.size / 2 + p.size) {
            state.boss.hp -= 2.0;
            setBossHp(Math.max(0, (state.boss.hp / state.boss.maxHp) * 100));
            createParticles(p.x, p.y, '#22d3ee', 3, 0.5);
            state.projectiles.splice(i, 1);
            if (state.boss.hp <= 0) triggerVictory();
            continue;
          }
        }
        if (p.x < -100 || p.x > canvas.width + 100) state.projectiles.splice(i, 1);
      }
    }

    // Particle Physics
    state.particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.04;
    });
    state.particles = state.particles.filter((p) => p.life > 0);

    // -- RENDER VISUALS --
    // Background gradient (changes during teleport/boss)
    ctx.fillStyle = state.status === 'boss_fight' || state.status === 'boss_intro' ? '#270814' : 
                   state.status === 'teleporting' ? `hsl(${state.teleportFrame * 5}, 50%, 15%)` : '#0a0f1c'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic grid that scrolls
    const bgOffset = state.globalX % 80;
    ctx.strokeStyle = state.status === 'teleporting' 
      ? `hsla(${(state.hue + state.teleportFrame * 10) % 360}, 80%, 50%, 0.4)`
      : state.status === 'boss_fight' ? `hsla(350, 80%, 30%, 0.3)` 
      : `hsla(${state.hue}, 80%, 30%, 0.2)`;
    
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -bgOffset; x < canvas.width; x += 80) {
      ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 80) {
      ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    if (state.status === 'teleporting') {
      const alpha = Math.min(1, state.teleportFrame / 60);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.sin(state.teleportFrame * 0.2) * 0.2 * alpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Top and Bottom boundary lines
    ctx.fillStyle = state.status === 'boss_fight' ? '#4c0519' : `hsla(${state.hue}, 90%, 15%, 1)`;
    ctx.fillRect(0, 0, canvas.width, 15);
    ctx.fillRect(0, canvas.height - 15, canvas.width, 15);
    
    ctx.strokeStyle = state.status === 'boss_fight' ? '#be123c' : `hsla(${state.hue}, 100%, 60%, 0.8)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 15); ctx.lineTo(canvas.width, 15);
    ctx.moveTo(0, canvas.height - 15); ctx.lineTo(canvas.width, canvas.height - 15);
    ctx.stroke();

    // Custom Boss Laser Render
    if (state.status === 'boss_fight' && state.boss.laserCharging) {
      const alpha = state.boss.laserFrame < 60 ? (state.boss.laserFrame / 60) * 0.3 : 1;
      const width = state.boss.laserFrame < 60 ? 2 : 60;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(state.boss.x, state.boss.laserTargetY);
      ctx.lineTo(0, state.boss.laserTargetY);
      ctx.strokeStyle = `rgba(244, 63, 94, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
      if (state.boss.laserFrame >= 60) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = width / 3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // The Trail
    if (state.trail.length > 0 && state.status !== 'boss_intro' && state.status !== 'boss_fight') {
      ctx.beginPath();
      state.trail.forEach((pt, i) => {
        const screenX = pt.gx - state.globalX;
        if (i === 0) ctx.moveTo(screenX, pt.gy);
        else ctx.lineTo(screenX, pt.gy);
      });
      if (state.status !== 'dead') {
        ctx.lineTo(state.player.x, state.player.y);
      }
      
      ctx.strokeStyle = `hsla(${state.hue}, 100%, 50%, 0.3)`;
      ctx.lineWidth = state.player.size * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.strokeStyle = `hsla(${state.hue}, 100%, 70%, 1)`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Draw Obstacles & Orbs
    ctx.fillStyle = '#0f172a';
    ctx.lineWidth = 2;
    state.obstacles.forEach((obs) => {
      if (obs.type === 'target_orb' && !obs.passed) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.size + Math.sin(state.frames * 0.2) * 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (obs.type !== 'target_orb') {
        ctx.beginPath();
        ctx.rect(obs.x, 0, obs.w, obs.topH);
        ctx.fill();
        ctx.strokeStyle = `hsla(${state.hue}, 100%, 65%, 0.8)`;
        ctx.strokeRect(obs.x, 0, obs.w, obs.topH);
        
        ctx.beginPath();
        ctx.rect(obs.x, obs.bottomY, obs.w, canvas.height - obs.bottomY);
        ctx.fill();
        ctx.strokeStyle = `hsla(${state.hue}, 100%, 65%, 0.8)`;
        ctx.strokeRect(obs.x, obs.bottomY, obs.w, canvas.height - obs.bottomY);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(obs.x + 4, 4, obs.w - 8, obs.topH - 8);
        ctx.strokeRect(obs.x + 4, obs.bottomY + 4, obs.w - 8, canvas.height - obs.bottomY - 8);
      }
    });

    // Draw Boss
    if (state.status === 'boss_intro' || state.status === 'boss_fight') {
      const b = state.boss;
      
      ctx.save();
      ctx.translate(b.x, b.y);
      
      // Hover effect
      ctx.translate(0, Math.sin(state.frames * 0.1) * 10);
      
      // Aura
      ctx.beginPath();
      ctx.arc(0, 0, b.size * 0.6 + Math.sin(state.frames * 0.2) * 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(225, 29, 72, 0.3)';
      ctx.fill();

      if (bossImg.current && bossImg.current.complete && bossImg.current.naturalHeight !== 0) {
        // Draw circular image
        ctx.beginPath();
        ctx.arc(0, 0, b.size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(bossImg.current, -b.size / 2, -b.size / 2, b.size, b.size);
      } else {
        // Backup shape if image not uploaded
        ctx.fillStyle = '#9f1239';
        ctx.beginPath();
        ctx.arc(0, 0, b.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOSS', 0, 0);
      }

      ctx.restore();
    }

    // Draw Projectiles
    state.projectiles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      
      // Glow
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Player
    if (state.status !== 'dead' && state.status !== 'victory') {
      ctx.save();
      const p = state.player;
      ctx.translate(p.x, p.y);
      
      const slope = inputRef.current.holding ? -0.8 : 0.8;
      ctx.rotate(slope);
      
      ctx.beginPath();
      ctx.moveTo(p.size, 0); 
      ctx.lineTo(-p.size, p.size * 0.7); 
      ctx.lineTo(-p.size * 0.4, 0); 
      ctx.lineTo(-p.size, -p.size * 0.7); 
      ctx.closePath();
      
      ctx.fillStyle = state.status === 'boss_fight' || state.status === 'boss_intro' ? '#06b6d4' : `hsla(${state.hue}, 100%, 50%, 1)`;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw Particles
    state.particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life > 0 ? p.life : 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.random() * 3 + 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Joystick Vis
    if (state.status === 'boss_fight' && inputRef.current.joystick.active) {
      const stick = inputRef.current.joystick;
      ctx.save();
      ctx.beginPath();
      ctx.arc(stick.startX, stick.startY, 50, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      const dx = stick.curX - stick.startX;
      const dy = stick.curY - stick.startY;
      const dist = Math.min(50, Math.sqrt(dx*dx + dy*dy));
      const angle = Math.atan2(dy, dx);
      
      ctx.beginPath();
      ctx.arc(stick.startX + Math.cos(angle) * dist, stick.startY + Math.sin(angle) * dist, 25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fill();
      ctx.restore();
    }

    // Overlay animation lines during teleport
    if (state.status === 'teleporting') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for(let i=0; i<10; i++) {
        const lineY = Math.random() * canvas.height;
        ctx.fillRect(0, lineY, canvas.width, 2);
      }
    }

    // Loop
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      inputRef.current.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (e.repeat) return; // Prevent key repeat firing constantly 
        e.preventDefault();
        handleInputDown({ clientX: 0, clientY: 0 } as any);
      }
    };
    const onKeyup = (e: KeyboardEvent) => {
      inputRef.current.keys[e.code] = false;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleInputUp();
      }
    };

    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
    };
  }, [initGame]);

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(gameLoop);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-screen bg-[#0a0f1c] overflow-hidden select-none touch-none"
      onPointerDown={handleInputDown}
      onPointerMove={handleInputMove}
      onPointerUp={handleInputUp}
      onPointerLeave={handleInputUp}
      onPointerCancel={handleInputUp}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Game HUD */}
      {(uiStatus === 'playing' || uiStatus === 'boss_fight' || uiStatus === 'boss_intro' || uiStatus === 'teleporting') && (
        <div className="absolute top-6 left-8 right-8 flex justify-between items-start pointer-events-none opacity-90">
          <div className="text-white font-mono text-3xl font-black drop-shadow-lg">
            {score}
          </div>
          
          {(uiStatus === 'boss_intro' || uiStatus === 'boss_fight') && (
            <div className="flex flex-col items-end w-64 animate-in fade-in slide-in-from-top-4">
              <span className="text-rose-500 font-black tracking-widest uppercase mb-2 text-shadow-md">Boss HP</span>
              <div className="w-full h-4 bg-slate-900 rounded-full border border-rose-900 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-200"
                  style={{ width: `${bossHp}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teleport Overlay text */}
      {uiStatus === 'teleporting' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <h2 className="text-white text-5xl md:text-7xl font-black tracking-[0.3em] uppercase italic animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
            Warning
          </h2>
        </div>
      )}

      {/* Main Menu */}
      {uiStatus === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0f1c]/80 backdrop-blur-md transition-all overflow-y-auto pt-10 pb-10">
          
          {/* Top Bar / Profile */}
          <div className="absolute top-6 left-8 pointer-events-auto flex items-center gap-4">
             <button 
                onClick={toggleFullscreen}
                className="p-3 bg-slate-900/50 text-slate-400 hover:text-cyan-400 rounded-full border border-slate-700/50 transition-all hover:scale-110 active:scale-90"
              >
                {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
          </div>

          <div className="absolute top-6 right-8 pointer-events-auto flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 bg-slate-900/50 p-1 px-4 rounded-full border border-cyan-500/20">
                <span className="text-cyan-400 font-mono text-sm">{displayUsername}</span>
                <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setIsAuthModalOpen(true); setAuthMode('login'); }}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-white px-4 py-2 rounded-full font-bold transition-all"
              >
                <LogIn className="w-5 h-5" />
                <span>Login</span>
              </button>
            )}
          </div>

          <div className="text-center animate-in fade-in zoom-in duration-500 delay-100 pointer-events-auto max-w-4xl w-full px-6">
            <div className="flex flex-col items-center justify-center mb-4">
              <div className="flex items-center mb-2">
                <Navigation className="w-10 h-10 text-cyan-400 mr-4 rotate-45" />
                <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 italic drop-shadow-xl">
                  WAVE DASH
                </h1>
              </div>
              <p className="text-slate-400 text-sm tracking-[0.2em] uppercase font-semibold">
                Hold to Fly • WASD for Boss
              </p>
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 items-center justify-center w-full mb-10">
              {/* Play Section */}
              <div className="flex flex-col items-center">
                <button
                  onClick={(e) => { e.stopPropagation(); initGame(); }}
                  className="group relative inline-flex items-center justify-center px-12 py-6 font-black text-white transition-all duration-200 bg-cyan-500 rounded-2xl hover:bg-cyan-400 hover:scale-105 active:scale-95 shadow-[0_0_40px_-5px_rgba(6,182,212,0.6)] cursor-pointer"
                >
                  <Play className="w-8 h-8 mr-3 fill-current" />
                  <span className="text-3xl tracking-widest leading-none mt-1">PLAY</span>
                </button>
                {highScore > 0 && (
                  <div className="mt-4 text-cyan-400/60 font-mono text-sm uppercase tracking-widest flex items-center">
                    <Trophy className="w-4 h-4 mr-2" /> Best: {highScore}
                  </div>
                )}
              </div>

              {/* Leaderboard Section */}
              <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 w-full md:w-80 backdrop-blur-sm">
                <h3 className="text-cyan-400 font-black uppercase tracking-widest text-sm mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <Trophy className="w-4 h-4 mr-2" /> Top Pilots
                  </div>
                  <div className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : dbStatus === 'missing' ? 'bg-amber-500' : 'bg-red-500'} `} title={`DB Status: ${dbStatus}`} />
                </h3>
                {isLeaderboardLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
                    {!user && (
                      <p className="text-cyan-400/50 text-[10px] text-center mb-2 italic">Login to post your score!</p>
                    )}
                    {leaderboard.length === 0 ? (
                      <p className="text-slate-500 text-xs text-center py-4">No records yet</p>
                    ) : (
                      leaderboard.map((entry, idx) => (
                        <div key={idx} className={`flex justify-between items-center text-xs font-mono border-b border-slate-800 pb-1 ${user?.id === entry.user_id ? 'bg-cyan-500/10 -mx-2 px-2' : ''}`}>
                          <span className="text-slate-400 w-6">#{idx + 1}</span>
                          <span className="text-white flex-1 truncate px-2">{entry.username}</span>
                          <span className="text-cyan-400 font-bold">{entry.score}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <button onClick={fetchLeaderboard} className="w-full mt-4 text-[10px] uppercase text-slate-500 hover:text-cyan-400 transition-colors">
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-wider">
              {authMode === 'login' ? 'Welcome Back' : 'Join the Fleet'}
            </h2>
            
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs uppercase text-slate-500 font-bold mb-1 ml-1">Username</label>
                  <input 
                    type="text" 
                    value={displayUsername} 
                    onChange={(e) => setDisplayUsername(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                    placeholder="SkyWalker"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1 ml-1">Email</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="pilot@starship.com"
                />
              </div>
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1 ml-1">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="••••••••"
                />
              </div>
              
              {authError && <p className="text-rose-500 text-xs font-bold px-1">{authError}</p>}
              
              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-white font-black py-4 rounded-xl transition-all flex justify-center items-center"
              >
                {authLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'LOGIN' : 'REGISTER')}
              </button>
            </form>
            
            <div className="mt-6 text-center">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-slate-400 hover:text-cyan-400 text-sm font-bold uppercase transition-colors"
              >
                {authMode === 'login' ? "Need an account? Sign Up" : "Back to Login"}
              </button>
            </div>
            
            <button 
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Victory */}
      {uiStatus === 'victory' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/80 backdrop-blur-md transition-all pointer-events-none">
           <div className="bg-slate-900 border-2 border-emerald-500/50 p-10 md:p-14 rounded-[2rem] shadow-[0_0_50px_rgba(16,185,129,0.3)] text-center transform animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-500 pointer-events-auto">
            <h2 className="text-5xl md:text-6xl font-black text-emerald-400 mb-4 uppercase tracking-widest drop-shadow-md">
              Boss Defeated!
            </h2>
            <p className="text-emerald-200/80 mb-8 font-mono text-xl">+500 Point Bonus</p>
            <div className="flex justify-center items-center bg-slate-800/80 px-8 py-5 rounded-xl mb-10 border border-emerald-500/30">
              <span className="text-emerald-400 font-bold uppercase tracking-widest mr-4">Final Score</span>
              <span className="text-white text-4xl font-black font-mono">{score}</span>
            </div>
            
             <button
              onClick={(e) => { e.stopPropagation(); initGame(); }}
              className="w-full relative inline-flex items-center justify-center px-8 py-5 font-black text-white transition-all duration-200 bg-emerald-600 rounded-xl hover:bg-emerald-500 hover:scale-[1.03] active:scale-[0.97] cursor-pointer shadow-lg"
            >
              <RotateCcw className="w-6 h-6 mr-3" />
              <span className="text-xl tracking-widest uppercase mt-1">Play Again</span>
            </button>
           </div>
        </div>
      )}

      {/* Game Over */}
      {uiStatus === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/70 backdrop-blur-md transition-all pointer-events-none">
          <div className="bg-slate-900 border-2 border-slate-700/50 p-10 md:p-14 rounded-[2rem] shadow-2xl text-center transform animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-300 pointer-events-auto w-full max-w-lg">
            <h2 className="text-5xl md:text-6xl font-black text-rose-500 mb-8 uppercase tracking-widest drop-shadow-md">
              Crashed!
            </h2>

            <div className="flex flex-col gap-4 mb-10">
              <div className="flex justify-between items-center bg-slate-800/80 px-8 py-5 rounded-xl">
                <span className="text-slate-400 font-bold uppercase tracking-widest">Score</span>
                <span className="text-white text-3xl font-black font-mono">{score}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-800/80 px-8 py-5 rounded-xl border border-cyan-500/30">
                <span className="text-cyan-400 flex items-center font-bold uppercase tracking-widest">
                  <Trophy className="w-5 h-5 mr-3" /> High Score
                </span>
                <span className="text-cyan-400 text-3xl font-black font-mono">{highScore}</span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); initGame(); }}
                className="w-full relative inline-flex items-center justify-center px-8 py-5 font-black text-white transition-all duration-200 bg-indigo-600 rounded-xl hover:bg-indigo-500 hover:scale-[1.03] active:scale-[0.97] cursor-pointer shadow-lg"
              >
                <RotateCcw className="w-6 h-6 mr-3" />
                <span className="text-xl tracking-widest uppercase mt-1">Try Again</span>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setGameStatus('menu'); }}
                className="w-full relative inline-flex items-center justify-center px-8 py-4 font-black text-slate-300 transition-all duration-200 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 hover:text-white cursor-pointer shadow-md"
              >
                <span className="text-lg tracking-widest uppercase">Main Menu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
