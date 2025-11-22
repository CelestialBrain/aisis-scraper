  async login() {
    console.log('🔐 Authenticating...');
    try {
      // 1) GET login page first (seed cookies / tokens)
      const displayResp = await this._request(`${this.baseUrl}/j_aisis/displayLogin.do`, { method: 'GET' });
      const displayHtml = await displayResp.text();
      const $d = cheerio.load(displayHtml);
      const rnd = $d('input[name="rnd"]').attr('value') || ('r' + Math.random().toString(36).substring(7));

      const params = new URLSearchParams();
      params.append('userName', this.username);
      params.append('password', this.password);
      params.append('submit', 'Sign in');
      params.append('command', 'login');
      params.append('rnd', rnd);

      // 2) POST credentials
      const loginResp = await this._request(`${this.baseUrl}/j_aisis/login.do`, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${this.baseUrl}/j_aisis/displayLogin.do` }
      });

      // 3) Debug: immediate info about the POST response
      console.log('DEBUG login POST -> status:', loginResp.status);
      try {
        console.log('DEBUG login POST -> url:', loginResp.url || '(no url property)');
      } catch (e) {}
      const loginLocation = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('location'));
      const loginSetCookie = loginResp.headers && (loginResp.headers.get && loginResp.headers.get('set-cookie'));
      console.log('DEBUG login POST -> location header:', loginLocation);
      console.log('DEBUG login POST -> set-cookie header:', loginSetCookie && loginSetCookie.slice(0, 200));

      // 4) If the POST returned an HTML body, check for success markers immediately
      const postHtml = await loginResp.text().catch(() => '');
      if (postHtml && /User Identified As|Welcome|Ateneo/i.test(postHtml)) {
        console.log('✅ Authentication Successful (detected in POST response body)');
        await new Promise(r => setTimeout(r, 800));
        return;
      }

      // 5) If Location header present and not automatically followed (should be followed), fetch it explicitly
      if (loginLocation) {
        const absolute = loginLocation.startsWith('http') ? loginLocation : (new URL(loginLocation, this.baseUrl)).toString();
        console.log('DEBUG following Location ->', absolute);
        const followResp = await this._request(absolute, { method: 'GET' });
        const followHtml = await followResp.text().catch(() => '');
        if (followHtml && /User Identified As|Welcome|Ateneo/i.test(followHtml)) {
          console.log('✅ Authentication Successful (followed Location header)');
          return;
        } else {
          console.log('DEBUG followResp.status:', followResp.status);
          console.log('DEBUG followResp.url:', followResp.url || absolute);
          // continue to fallback attempts
        }
      }

      // 6) Candidate landing pages to try as fallbacks (some AISIS installs differ)
      const candidates = [
        '/j_aisis/user/home.do',
        '/j_aisis/user/home',
        '/j_aisis/home.do',
        '/j_aisis/displayHome.do',
        '/user/home',         // less likely, but try
        '/j_aisis/jsp/home.do'
      ];

      for (const path of candidates) {
        try {
          const url = new URL(path, this.baseUrl).toString();
          const r = await this._request(url, { method: 'GET' });
          const txt = await r.text().catch(() => '');
          console.log(`DEBUG try candidate ${url} -> status ${r.status}`);
          if (txt && /User Identified As|Welcome|Ateneo/i.test(txt)) {
            console.log('✅ Authentication Successful (candidate):', url);
            return;
          }
        } catch (e) {
          console.log(`DEBUG candidate ${path} failed:`, e.message);
        }
      }

      // 7) If we get here, we failed to find authenticated landing. Save short snippet and raise.
      const snippet = (postHtml || '').slice(0, 2000);
      console.error('Login landing snippet:', snippet.replace(/\n/g, ' '));
      throw new Error('Authentication Failed: landing page did not contain expected markers (checked POST, Location, candidates).');

    } catch (err) {
      console.error('⛔ Critical Login Error:', err.message);
      throw err;
    }
  }
