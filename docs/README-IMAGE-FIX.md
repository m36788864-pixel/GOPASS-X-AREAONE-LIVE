# V7 Image Fix

The hero image is now referenced with an absolute `/images/event-banner.png` path and the hero art also uses the same asset as its CSS background. This prevents the hero from appearing as a blank black panel when the site is hosted at the root of a Render web service.

The hero gradient was softened so the dark text area blends into the concert image instead of creating a hard vertical seam.

For Render Docker deployment, keep `Dockerfile` at repository root.
