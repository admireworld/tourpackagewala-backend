# OTP Email Setup Guide (EmailJS — Free)

Login OTP ab backend se nahi, **seedha browser se EmailJS ke through**
customer ke inbox mein jaata hai — isliye Render/Gmail SMTP ki koi zaroorat
nahi, aur OTP reliably deliver hota hai.

Free tier: **200 emails/month** — chhoti/medium site ke liye kaafi hai.
Zyada chahiye to EmailJS ke paid plans hain.

Setup me 5 minute lagenge — sirf ek baar karna hai.

## Step 1 — EmailJS account banao

1. https://www.emailjs.com par jao aur free account bana lo (Google se
   sign in kar sakte ho).
2. Login karne ke baad Dashboard khulega.

## Step 2 — Email Service connect karo

1. Left sidebar mein **Email Services** pe click karo.
2. **Add New Email Service** pe click karo.
3. Gmail (ya Outlook, jo bhi use karte ho) select karo aur connect/authorize
   kar do (apna Gmail account login karke permission do — koi app password
   nahi chahiye, EmailJS khud handle karta hai).
4. Connect hone ke baad ek **Service ID** milega (jaise `service_abc1234`)
   — ise copy kar lo, aage lagega.

## Step 3 — Email Template banao

1. Left sidebar mein **Email Templates** pe click karo.
2. **Create New Template** pe click karo.
3. Template ka content kuch is tarah rakho (Subject aur Content dono edit
   kar sakte ho, bas neeche wale `{{...}}` variable names **exactly waise
   hi** rakhna — code inhi naam se data bhejta hai):

   **Subject:**
   ```
   Your AdmireDworld Travel login OTP
   ```

   **Content (Body):**
   ```
   Hi {{to_name}},

   Your OTP is {{otp}}. It is valid for 5 minutes.

   If you didn't request this, you can ignore this email.

   — AdmireDworld Travel
   ```

4. **To Email** field mein template settings ke andar `{{to_email}}` daalo
   (ye batata hai EmailJS ko ki email kisko jaani hai — customer ke email
   pe, na ki tumhare apne inbox mein).
5. Save karo. Ek **Template ID** milega (jaise `template_xyz789`) — ise bhi
   copy kar lo.

## Step 4 — Public Key lo

1. Left sidebar mein **Account** → **General** pe jao.
2. Wahan **Public Key** dikhega (jaise `AbCdEfGhIjKlMnOp`) — ise copy kar lo.

## Step 5 — Teeno values `script.js` mein daalo

`frontend/script.js` file kholo, sabse upar ye teen lines milengi:

```js
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY";
const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
```

Inhe apni real values se replace karo, jaise:

```js
const EMAILJS_PUBLIC_KEY  = "AbCdEfGhIjKlMnOp";
const EMAILJS_SERVICE_ID  = "service_abc1234";
const EMAILJS_TEMPLATE_ID = "template_xyz789";
```

Save karo, deploy kar do (Netlify/Vercel/jo bhi host use kar rahe ho) — done!

## Test kaise karo

1. Site kholo, Login pe click karo, apna naam/phone/email daalo, "Send OTP"
   dabao.
2. Us email ke inbox (aur spam/junk folder bhi) mein OTP aana chahiye
   turant.
3. Agar nahi aaya:
   - Browser console (F12 → Console tab) kholo aur error dekho.
   - **"OTP email isn't set up yet"** → matlab teeno values sahi se nahi
     bhari, Step 5 dobara check karo.
   - EmailJS Dashboard → **Email Services** ya **Email Templates** mein
     jaake dekho koi error/quota exceeded to nahi dikha raha.
   - Free tier ka 200/month limit to nahi khatam ho gaya.

## Security note

Pehle OTP sirf server pe generate/store hota tha aur browser tak kabhi
nahi aata tha. Ab EmailJS se bhejne ke liye OTP backend response mein
browser tak aata hai (thodi der ke liye network response mein dikhता hai)
— lekin baaki sab protections wahi hain: OTP hash karke store hota hai,
5 minute mein expire ho jaata hai, ek hi baar use ho sakta hai, aur
galat attempts + resend requests dono rate-limited hain. Ye trade-off
zyadatar chhoti/medium business sites ke liye standard aur acceptable hai.
