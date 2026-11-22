# Multitool

https://manofneptune27.github.io/Multitool/

A page for saving public videos and making QR codes. It uses the same layout as the reading log.

## Password

The lock is in the page itself. The repository is public, so this keeps casual visitors out. It does not hide the code.

To change the password:

```bash
python3 set_password.py
```

Commit `script.js` and push. The password is not written in the file. Only its hash is.

## QR codes

The QR card runs in the browser. It does not send the text anywhere.

QR codes are drawn with Project Nayuki's QR Code generator, MIT license: https://github.com/nayuki/QR-Code-generator

## Videos

GitHub Pages cannot fetch a video. A helper on your computer runs yt-dlp. Run the helper on the same system as the browser. Chrome on Windows cannot see a helper that is running only inside WSL.

Windows:

```powershell
py -3 -m pip install --user yt-dlp
py -3 helper/server.py
```

Ubuntu:

```bash
python3 -m venv helper/.venv
helper/.venv/bin/pip install -r helper/requirements.txt
python3 helper/server.py
```

Leave that window open. Open the site in Chrome or Edge. If the browser asks to look at your local network, choose Allow.

The helper listens only on 127.0.0.1. A saved video needs ffmpeg if the site splits picture and sound. `py -3 -m pip install --user imageio-ffmpeg` is a free copy the helper can find when you start it with that same Python. YouTube also needs a free JavaScript runtime such as Deno on your PATH.

The helper saves public media. A private or login-only post will fail.
