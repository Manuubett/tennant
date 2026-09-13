const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.style.display = "none";
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  const data = new FormData(form);
  try {
    const cred = await auth.signInWithEmailAndPassword(data.get("email"), data.get("password"));
    const { role } = await getCurrentUserRole(cred.user);

    if (role === "staff") {
      window.location.href = "dashboard.html";
    } else if (role === "tenant") {
      window.location.href = "portal.html";
    } else {
      errorBox.textContent = "This account isn't set up as a tenant or staff member yet. Contact the office.";
      errorBox.style.display = "block";
      loginBtn.disabled = false;
      loginBtn.textContent = "Log In";
      auth.signOut();
    }
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Incorrect email or password.";
    errorBox.style.display = "block";
    loginBtn.disabled = false;
    loginBtn.textContent = "Log In";
  }
});
