from playwright.async_api import async_playwright, Browser, BrowserContext, Page
import json
import os
from core.config import config

class SessionManager:
    """Manage Playwright browser session"""
    
    def __init__(self):
        self.playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        self.page: Page = None
    
    async def start(self):
        """Start browser session"""
        print("🚀 Starting browser session...")
        
        self.playwright = await async_playwright().start()
        
        # Launch browser
        self.browser = await self.playwright.chromium.launch(
            headless=config.HEADLESS,
            slow_mo=config.SLOW_MO
        )
        
        # Check if auth file exists
        if os.path.exists(config.AUTH_FILE):
            print("📁 Loading existing session...")
            self.context = await self.browser.new_context(storage_state=config.AUTH_FILE)
        else:
            print("🆕 Creating new session...")
            self.context = await self.browser.new_context()
        
        self.page = await self.context.new_page()
        
        print("✅ Browser session started")
        return self.page
    
    async def login_manual(self):
        """Manual login - user needs to login manually"""
        print("\n" + "="*60)
        print("🔐 MANUAL LOGIN REQUIRED")
        print("="*60)
        print(f"Browser opened. Please login to your trading platform.")
        print(f"After login, the session will be saved automatically.")
        print(f"Session file: {config.AUTH_FILE}")
        print("="*60 + "\n")
        
        # Navigate to TMS login page
        await self.page.goto("https://tms.nepalstock.com")
        
        # Wait for user to login (check for specific element that appears after login)
        try:
            await self.page.wait_for_selector("text=Market", timeout=300000)  # 5 minutes timeout
            print("✅ Login successful!")
            
            # Save session
            await self.save_session()
            return True
        except Exception as e:
            print(f"❌ Login timeout or error: {e}")
            return False
    
    async def save_session(self):
        """Save session to file"""
        try:
            await self.context.storage_state(path=config.AUTH_FILE)
            print(f"✅ Session saved to {config.AUTH_FILE}")
        except Exception as e:
            print(f"❌ Error saving session: {e}")
    
    async def validate_session(self) -> bool:
        """Validate if session is still active"""
        try:
            # Check if we can access a protected page
            await self.page.goto("https://tms.nepalstock.com/market")
            await self.page.wait_for_load_state("networkidle")
            
            # Check for login redirect or market content
            if "login" in self.page.url.lower():
                print("❌ Session expired - redirected to login")
                return False
            
            print("✅ Session is valid")
            return True
        except Exception as e:
            print(f"❌ Session validation error: {e}")
            return False
    
    async def reconnect(self):
        """Reconnect if session expired"""
        print("🔄 Attempting to reconnect...")
        await self.stop()
        await self.start()
        return await self.validate_session()
    
    async def stop(self):
        """Stop browser session"""
        print("🛑 Stopping browser session...")
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            print("✅ Browser session stopped")
        except Exception as e:
            print(f"Error stopping session: {e}")
"""
Session Manager - Handles browser session and authentication
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from core.config import settings

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages browser session for trading platform"""
    
    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.session_file = Path(settings.SESSION_DIR) / "session.json"
        self.auth_file = Path(settings.AUTH_DIR) / "auth.json"
    
    async def start(self):
        """Start browser and load session"""
        logger.info("Starting browser session...")
        
        self.playwright = await async_playwright().start()
        
        # Launch browser
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        )
        
        # Load or create context
        if self.auth_file.exists():
            logger.info("Loading existing auth session...")
            storage_state = json.loads(self.auth_file.read_text())
            self.context = await self.browser.new_context(storage_state=storage_state)
        else:
            logger.info("Creating new browser context...")
            self.context = await self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
        
        self.page = await self.context.new_page()
        logger.info("Browser session started")
    
    async def stop(self):
        """Stop browser and save session"""
        logger.info("Stopping browser session...")
        
        if self.context:
            # Save storage state
            storage_state = await self.context.storage_state()
            self.auth_file.parent.mkdir(parents=True, exist_ok=True)
            self.auth_file.write_text(json.dumps(storage_state))
            logger.info("Auth session saved")
        
        if self.browser:
            await self.browser.close()
        
        if self.playwright:
            await self.playwright.stop()
        
        logger.info("Browser session stopped")
    
    async def login_required(self) -> bool:
        """Check if login is required"""
        return not self.auth_file.exists()
    
    async def navigate_to_login(self):
        """Navigate to login page"""
        logger.info(f"Navigating to {settings.TRADING_PLATFORM_URL}")
        await self.page.goto(settings.TRADING_PLATFORM_URL)
        await self.page.wait_for_load_state('networkidle')
    
    async def wait_for_manual_login(self):
        """Wait for user to complete manual login"""
        logger.info("Waiting for manual login... (timeout: 5 minutes)")
        
        try:
            # Wait for user to login and reach dashboard
            await self.page.wait_for_url("**/dashboard**", timeout=300000)
            logger.info("Login detected!")
            
            # Save session
            storage_state = await self.context.storage_state()
            self.auth_file.parent.mkdir(parents=True, exist_ok=True)
            self.auth_file.write_text(json.dumps(storage_state))
            logger.info("Session saved after login")
            
            return True
        except Exception as e:
            logger.error(f"Login timeout or error: {e}")
            return False
    
    async def navigate_to_market_depth(self, symbol: str):
        """Navigate to market depth page for a symbol"""
        try:
            url = f"{settings.TRADING_PLATFORM_URL}/market-depth/{symbol}"
            await self.page.goto(url)
            await self.page.wait_for_load_state('networkidle')
            logger.debug(f"Navigated to market depth for {symbol}")
        except Exception as e:
            logger.error(f"Failed to navigate to market depth for {symbol}: {e}")
            raise
    
    async def is_session_valid(self) -> bool:
        """Check if session is still valid"""
        try:
            # Try to access a protected page
            await self.page.goto(settings.TRADING_PLATFORM_URL)
            await self.page.wait_for_load_state('networkidle', timeout=10000)
            
            # Check if redirected to login
            current_url = self.page.url
            if 'login' in current_url.lower():
                logger.warning("Session expired - redirected to login")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Session validation failed: {e}")
            return False
    
    async def reconnect(self):
        """Reconnect session"""
        logger.info("Attempting to reconnect...")
        
        await self.stop()
        await self.start()
        
        if await self.login_required():
            logger.error("Reconnection failed - login required")
            return False
        
        return await self.is_session_valid()
    
    def get_page(self) -> Optional[Page]:
        """Get current page"""
        return self.page
