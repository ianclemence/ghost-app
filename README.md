# Ghost app

**Your AI. Your Memory. Your Machine.**

The phone half of [Ghost](https://github.com/ianclemence/ghost). Talk to your
Ghost from anywhere, approve what it wants to do, see what it has been up to, and
step in when it needs a human.

Your Ghost lives on a Pod at home. It does the thinking, remembering and doing;
this app is how you reach it. There is no smaller Ghost on the phone, because a
model small enough for a phone can't do what Ghost does. Away from the Pod the app
is honest instead: your last conversation stays readable, and new messages wait
until the Pod is back.

> **Pre-release.** It is built, type-checked, linted and tested, and has been
> driven against a real Pod by a simulated phone. It has not yet run on a physical
> phone. [`docs/POD-TEST-GUIDE.md`](docs/POD-TEST-GUIDE.md) is the script for the
> first run.

---

## What you can do

**Talk.** One conversation, the same one you have in the terminal and the web
console. Send a message from any of them and the reply arrives here as it is
written, even if you open the app halfway through. Type a follow-up while Ghost is
working and it joins the turn. Dictate, attach photos and files, and keep writing
with no signal: messages wait and go out in order.

**Decide.** When Ghost wants to do something consequential, an approval card asks
first, and says what is at stake. You can allow it once, for this task, always, or
refuse.

**Step in.** Watch Ghost's browser live as it works. When a site asks for
something only a person can do, such as a "Verify you are human" box or a code
sent to your phone, Ghost stops and says so. Tap **Take over and steer**, do that
step on the live page with your own taps and typing, and tap **Done**. Ghost
carries on where you left it.

**See what it knows and did.** Everything Ghost remembers, and who each fact is
about, with your own words as the receipt: forget any of it. Everything it did,
with the outcome. Everything it does on its own, which you can pause or stop.

**Look after the Pod.** Its health, anything that needs attention, updates (after
you confirm), and a one-time code to reset the web console password without a
terminal.

**Connect things.** Apps by key or sign-in, and website logins saved once and
sealed on the Pod, never passed through the model.

**Be told.** Reminders, questions, finished tasks, and anything Ghost thinks you
should know arrive as push notifications, with the app closed. They carry fixed
wording and never the content of a message.

---

## Get started

1. On the Pod run `ghost pair`, or open the web console, **Devices**, **Connect
   another device**. A QR code appears. It works once and lasts five minutes.
2. In the app choose **Pair your Ghost**, then scan it. Or enter the address and
   code by hand.

The app exchanges the code for a credential of its own, kept in the phone's secure
storage. Each phone can be removed from the Pod independently.

To set up a brand-new Pod from the phone, choose **Set up a new Ghost Pod**. Away
from home, see [Reaching your Ghost away from home](https://github.com/ianclemence/ghost/blob/main/docs/CONNECT.md).

To run the app from source, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## How it connects

The app talks to the Pod's gateway with its own device credential, over server-sent
events for replies and one live connection for everything that happens without you
asking: replies from other devices, reminders, alerts, questions, approvals.
Credentials live in the iOS Keychain or Android Keystore and never in a URL. The
routes and error shapes are in the Pod's
[gateway API reference](https://github.com/ianclemence/ghost/blob/main/docs/MOBILE-API.md).

## Learn more

| | |
|---|---|
| [Using Ghost](https://github.com/ianclemence/ghost/blob/main/docs/GUIDE.md) | Day-to-day use, from the Pod's side |
| [Developing the app](docs/DEVELOPMENT.md) | Run it, test it, build and release it |
| [Testing on a real Pod](docs/POD-TEST-GUIDE.md) | The acceptance script |
