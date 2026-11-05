/* Beats Workspace — Auth UI (German) + Supabase session helpers */
const Auth = (function () {
  let client = null;
  let onSession = null;

  function init(sb, { onSessionChange }) {
    client = sb;
    onSession = onSessionChange;
    bindForm();
    client.auth.onAuthStateChange((_event, session) => {
      renderGate(session);
      if (onSession) onSession(session);
    });
    return client.auth.getSession().then(({ data }) => {
      renderGate(data.session);
      return data.session;
    });
  }

  function bindForm() {
    const form = document.getElementById("auth-form");
    const tabLogin = document.getElementById("auth-tab-login");
    const tabSignup = document.getElementById("auth-tab-signup");
    const nameWrap = document.getElementById("auth-name-wrap");
    const err = document.getElementById("auth-error");
    const submit = document.getElementById("auth-submit");
    let mode = "login";

    function setMode(next) {
      mode = next;
      const isSignup = mode === "signup";
      tabLogin.classList.toggle("active", !isSignup);
      tabSignup.classList.toggle("active", isSignup);
      nameWrap.style.display = isSignup ? "block" : "none";
      submit.textContent = isSignup ? "Registrieren" : "Anmelden";
      err.textContent = "";
    }

    tabLogin.addEventListener("click", () => setMode("login"));
    tabSignup.addEventListener("click", () => setMode("signup"));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      submit.disabled = true;
      const email = document.getElementById("auth-email").value.trim();
      const password = document.getElementById("auth-password").value;
      const displayName = document.getElementById("auth-name").value.trim();
      try {
        if (mode === "signup") {
          if (!displayName) throw new Error("Bitte einen Anzeigenamen eingeben.");
          if (password.length < 6) throw new Error("Passwort mindestens 6 Zeichen.");
          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } },
          });
          if (error) throw error;
          if (!data.session) {
            // Try immediate login (works when email confirmation is off).
            const login = await client.auth.signInWithPassword({ email, password });
            if (login.error) {
              throw new Error(
                "Konto erstellt. E-Mail-Bestaetigung ist noch aktiv — bitte Beat Bescheid geben, dann kannst du dich anmelden."
              );
            }
          }
        } else {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (ex) {
        err.textContent = ex.message || "Anmeldung fehlgeschlagen.";
      } finally {
        submit.disabled = false;
      }
    });
  }

  function renderGate(session) {
    const gate = document.getElementById("auth-gate");
    const app = document.getElementById("app");
    if (session) {
      gate.style.display = "none";
      app.style.display = "";
      app.classList.remove("auth-locked");
    } else {
      gate.style.display = "flex";
      app.style.display = "none";
      app.classList.add("auth-locked");
    }
  }

  async function signOut() {
    await client.auth.signOut();
  }

  return { init, signOut };
})();
