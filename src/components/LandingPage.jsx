import React, { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles, ArrowRight, Zap, Shield, TrendingUp, Target, ChevronRight, Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useAppStore } from '../contexts/useAppStore';

const LandingPage = ({ onGetStarted, language = 'zh', t }) => {
  const text = t[language].landing;
  const canvasRef = useRef(null);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const setLanguage = useAppStore(state => state.setLanguage);
  
  // Use local theme state for landing page if global theme is not applied here yet
  // But ideally should use useAppStore theme
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);

  useEffect(() => {
    // Sync theme with document class
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = windowSize.width;
    canvas.height = windowSize.height;

    const particles = [];
    const particleCount = Math.min(Math.floor((windowSize.width * windowSize.height) / 15000), 80); // Increased count slightly
    const connectionDistance = 150;
    
    // Safe Zone Definitions (The "Hole" in the middle)
    // We define a central box where particles CANNOT go.
    // Everything outside this box is fair game.
    const safeZoneXMargin = 0.20; // 20% margin on left/right (so center 60% is safe)
    const safeZoneYMargin = 0.15; // 15% margin on top/bottom (so center 70% is safe)
    
    const safeBox = {
        x: canvas.width * safeZoneXMargin,
        y: canvas.height * safeZoneYMargin,
        width: canvas.width * (1 - 2 * safeZoneXMargin),
        height: canvas.height * (1 - 2 * safeZoneYMargin),
        right: canvas.width * (1 - safeZoneXMargin),
        bottom: canvas.height * (1 - safeZoneYMargin)
    };

    // Array of crypto image URLs (using cryptologos.cc)
    const cryptoImages = [
      'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=026',
      'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=026',
      'https://cryptologos.cc/logos/solana-sol-logo.png?v=026',
      'https://cryptologos.cc/logos/dogecoin-doge-logo.png?v=026',
      'https://cryptologos.cc/logos/tether-usdt-logo.png?v=026',
      'https://cryptologos.cc/logos/cardano-ada-logo.png?v=026',
      'https://cryptologos.cc/logos/binance-coin-bnb-logo.png?v=026',
      'https://cryptologos.cc/logos/xrp-xrp-logo.png?v=026'
    ];

    // Preload images
    const loadedImages = cryptoImages.map(src => {
      const img = new Image();
      img.src = src;
      return img;
    });

    class Particle {
      constructor() {
        // Spawn randomly OUTSIDE the safe box
        // We pick a side (top, bottom, left, right)
        const side = Math.floor(Math.random() * 4);
        
        if (side === 0) { // Top
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * safeBox.y;
        } else if (side === 1) { // Bottom
            this.x = Math.random() * canvas.width;
            this.y = safeBox.bottom + Math.random() * (canvas.height - safeBox.bottom);
        } else if (side === 2) { // Left
            this.x = Math.random() * safeBox.x;
            this.y = Math.random() * canvas.height;
        } else { // Right
            this.x = safeBox.right + Math.random() * (canvas.width - safeBox.right);
            this.y = Math.random() * canvas.height;
        }
        
        this.vx = (Math.random() - 0.5) * 1.8; 
        this.vy = (Math.random() - 0.5) * 1.8; 
        this.size = Math.random() * 15 + 20; // Increased size for images (20-35px)
        this.image = loadedImages[Math.floor(Math.random() * loadedImages.length)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;

        // Bounce off screen edges
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        // Bounce off Safe Box (The Content Area)
        // Check if inside the box
        if (this.x > safeBox.x && this.x < safeBox.right &&
            this.y > safeBox.y && this.y < safeBox.bottom) {
            
            // Determine which side was hit to bounce correctly
            // We look at the previous position (roughly) or just distance to edges
            
            const distToLeft = Math.abs(this.x - safeBox.x);
            const distToRight = Math.abs(this.x - safeBox.right);
            const distToTop = Math.abs(this.y - safeBox.y);
            const distToBottom = Math.abs(this.y - safeBox.bottom);
            
            const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            
            if (minDist === distToLeft) {
                this.x = safeBox.x - 1; // Push out
                this.vx = -Math.abs(this.vx); // Force left
            } else if (minDist === distToRight) {
                this.x = safeBox.right + 1; // Push out
                this.vx = Math.abs(this.vx); // Force right
            } else if (minDist === distToTop) {
                this.y = safeBox.y - 1; // Push out
                this.vy = -Math.abs(this.vy); // Force up
            } else { // Bottom
                this.y = safeBox.bottom + 1; // Push out
                this.vy = Math.abs(this.vy); // Force down
            }
        }
      }

      draw() {
        if (!this.image.complete) return; // Skip if image not loaded
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Draw image centered
        // Maintain aspect ratio, assume square icons
        const size = this.size;
        ctx.drawImage(this.image, -size/2, -size/2, size, size);
        
        ctx.restore();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i; j < particles.length; j++) {
            // Optimization: only connect if relatively close (pre-check x/y)
            if (Math.abs(particles[i].x - particles[j].x) > connectionDistance) continue;
            if (Math.abs(particles[i].y - particles[j].y) > connectionDistance) continue;

            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < connectionDistance) {
                // Check if the line segment intersects the safe box
                // Simple check: if midpoint is in safe box, don't draw
                // (This prevents lines crossing the text)
                const midX = (particles[i].x + particles[j].x) / 2;
                const midY = (particles[i].y + particles[j].y) / 2;
                
                if (midX > safeBox.x && midX < safeBox.right &&
                    midY > safeBox.y && midY < safeBox.bottom) {
                    continue;
                }

                ctx.beginPath();
                ctx.strokeStyle = `rgba(139, 92, 246, ${0.4 * (1 - distance / connectionDistance)})`; 
                ctx.lineWidth = 1;
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
      }

      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      requestAnimationFrame(animate);
    };

    animate();

  }, [windowSize, theme]); 

  return (
    <div 
      className="relative min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white overflow-x-hidden selection:bg-purple-500/30 transition-colors duration-500"
    >
      {/* Background Canvas & Effects - Fixed */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <canvas 
          ref={canvasRef}
          className="w-full h-full opacity-80"
          style={{ zIndex: -1 }} // Explicitly ensure canvas is behind everything
        />
        {/* Adjusted blobs for light/dark mode */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/20 dark:bg-purple-600 blur-[120px] opacity-30 dark:opacity-10 animate-pulse" style={{ zIndex: -2 }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/20 dark:bg-blue-600 blur-[120px] opacity-30 dark:opacity-10 animate-pulse delay-1000" style={{ zIndex: -2 }} />
      </div>

      {/* Top Controls */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 rounded-full hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 shadow-sm"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-yellow-400" />
          ) : (
            <Moon className="w-5 h-5 text-purple-600" />
          )}
        </button>

        {/* Language Switcher */}
        <button
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 rounded-full hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 shadow-sm"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{language === 'zh' ? 'EN' : '中文'}</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col">
        
        {/* Hero Section */}
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 text-center relative">
          <div className="mb-8 p-2 pr-4 rounded-full bg-white/50 dark:bg-gray-900/50 backdrop-blur-md border border-gray-200 dark:border-gray-800 inline-flex items-center gap-2 animate-fade-in-up shadow-sm">
            <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-1 rounded-full">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {text.badge}
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 tracking-tight animate-fade-in-up delay-100 max-w-5xl">
            {text.hero.title}
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl leading-relaxed animate-fade-in-up delay-200">
             {text.hero.description1}
             <span className="text-blue-600 dark:text-blue-400 font-semibold mx-1">{text.hero.cryptoTrading}</span>
             {text.hero.description2}
             <span className="text-purple-600 dark:text-purple-400 font-semibold mx-1">{text.hero.polymarketTrading}</span>
             <br className="hidden md:block"/>
             {text.hero.description3}
          </p>

          <div className="flex flex-col md:flex-row items-center gap-6 animate-fade-in-up delay-300 mb-16">
            <Button 
                onClick={onGetStarted}
                className="group relative px-8 py-6 text-lg bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 overflow-hidden rounded-full transition-all duration-300 transform hover:scale-105 shadow-xl"
            >
                <span className="relative z-10 flex items-center gap-2 font-bold">
                    {text.hero.cta}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
            </Button>
            
            <p className="text-sm text-gray-500">
              {text.hero.disclaimer}
            </p>
          </div>

          {/* 3D Rotating Cards Section */}
          <div className="w-full max-w-6xl mx-auto h-[400px] relative perspective-1000 mt-10 animate-fade-in-up delay-500">
            <div className="relative w-full h-full flex justify-center items-center animate-spin-slow transform-style-3d hover:pause">
               {/* Card 1 - Multi-AI */}
               <div className="absolute transform translate-z-[250px] rotate-y-0 group">
                 <div className="w-64 h-80 bg-white/10 dark:bg-gray-900/40 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/20 hover:border-blue-500 transition-all duration-500 hover:scale-110 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                    <Bot className="w-12 h-12 text-blue-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">{text.features.multiAI.title}</h3>
                    <p className="text-sm text-gray-400">{text.features.multiAI.description}</p>
                 </div>
               </div>

               {/* Card 2 - Fully Automated */}
               <div className="absolute transform rotate-y-90 translate-z-[250px] group">
                 <div className="w-64 h-80 bg-white/10 dark:bg-gray-900/40 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/20 hover:border-yellow-500 transition-all duration-500 hover:scale-110 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                    <Zap className="w-12 h-12 text-yellow-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">{text.features.autoExecution.title}</h3>
                    <p className="text-sm text-gray-400">{text.features.autoExecution.description}</p>
                 </div>
               </div>

               {/* Card 3 - Real-time */}
               <div className="absolute transform rotate-y-180 translate-z-[250px] group">
                 <div className="w-64 h-80 bg-white/10 dark:bg-gray-900/40 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/20 hover:border-green-500 transition-all duration-500 hover:scale-110 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                    <TrendingUp className="w-12 h-12 text-green-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600">{text.features.realtime.title}</h3>
                    <p className="text-sm text-gray-400">{text.features.realtime.description}</p>
                 </div>
               </div>

               {/* Card 4 - Risk Control */}
               <div className="absolute transform rotate-y-270 translate-z-[250px] group">
                 <div className="w-64 h-80 bg-white/10 dark:bg-gray-900/40 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/20 hover:border-purple-500 transition-all duration-500 hover:scale-110 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                    <Shield className="w-12 h-12 text-purple-500 mb-4" />
                    <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">{text.features.riskControl.title}</h3>
                    <p className="text-sm text-gray-400">{text.features.riskControl.description}</p>
                 </div>
               </div>
            </div>
          </div>

        </div>

        {/* Two Trading Modes Section */}
        <div className="container mx-auto px-6 py-24 border-t border-gray-200 dark:border-gray-800/50 bg-white/50 dark:bg-gray-950/50 backdrop-blur-sm">
          <h2 className="text-3xl md:text-4xl text-center mb-16 font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-500">
            {text.modes.title}
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Polymarket Mode */}
            <div className="group relative bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
                  <Target size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{text.modes.polymarket.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {text.modes.polymarket.description}
                </p>
                <ul className="space-y-3">
                  {text.modes.polymarket.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-gray-700 dark:text-gray-300">
                      <span className="text-green-600 dark:text-green-400 mr-3">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            {/* Crypto Mode */}
            <div className="group relative bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 hover:border-orange-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(249,115,22,0.15)] shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{text.modes.crypto.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {text.modes.crypto.description}
                </p>
                <ul className="space-y-3">
                  {text.modes.crypto.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-gray-700 dark:text-gray-300">
                      <span className="text-green-600 dark:text-green-400 mr-3">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="container mx-auto px-6 py-24">
          <h2 className="text-3xl md:text-4xl text-center mb-16 font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-500">
            {text.steps.title}
          </h2>
          
          <div className="max-w-4xl mx-auto space-y-6">
            {[text.steps.step1, text.steps.step2, text.steps.step3].map((step, idx) => (
              <div key={idx} className="flex items-start gap-6 bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors shadow-sm">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shadow-lg text-white
                  ${idx === 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 
                    idx === 1 ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 
                    'bg-gradient-to-br from-green-500 to-green-700'}`}>
                  {idx + 1}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{step.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Button
              onClick={onGetStarted}
              className="px-10 py-6 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-lg shadow-purple-900/30 transition-all hover:scale-105"
            >
              <span className="flex items-center gap-2">
                {text.hero.ctaSecondary}
                <ChevronRight className="w-5 h-5" />
              </span>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="container mx-auto px-6 py-12 border-t border-gray-200 dark:border-gray-800 text-center text-gray-500 text-sm">
          <p className="mb-4">{text.footer.disclaimer}</p>
          <p>{text.footer.copyright}</p>
        </div>

      </div>
      
      {/* CSS Animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-500 { animation-delay: 0.5s; }

        /* 3D Rotation Animation */
        @keyframes spin-slow {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        .hover\\:pause:hover {
          animation-play-state: paused;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .translate-z-\\[250px\\] {
          transform: rotateY(var(--tw-rotate-y, 0)) translateZ(250px);
        }
        /* Custom utility for rotate-y since Tailwind doesn't have it by default */
        .rotate-y-0 { --tw-rotate-y: 0deg; }
        .rotate-y-90 { --tw-rotate-y: 90deg; }
        .rotate-y-180 { --tw-rotate-y: 180deg; }
        .rotate-y-270 { --tw-rotate-y: 270deg; }
      `}} />
    </div>
  );
};

export default LandingPage;
