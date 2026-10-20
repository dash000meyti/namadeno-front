# فایل‌های طراحی مرجع

خروجی صفحه‌های طراحی نمادنو (Design artifact) — فقط برای مرجع و مقایسه هنگام بهبود ظاهر. در build استفاده نمی‌شوند.

- هر فایل `*.dc.html` سه بخش دارد: `<style>` (کلاس‌ها)، markup بین `</helmet>` و `<script type="text/x-dc">`، و منطق/داده‌ی نمایشی در `renderVals()`.
- این فایل‌ها با runtime ابزار طراحی رندر می‌شوند و مستقیم در مرورگر درست نمایش داده نمی‌شوند؛ markup و استایل‌ها خوانا هستند.
- نگاشت هر فایل به مسیر Next: `docs/IMPLEMENTATION-GUIDE.md`.
- `ns-*.dc.html` مستندات Design System (Foundation، Components، Contrast) هستند؛ `Main.dc.html` نقشه‌ی صفحه‌ها.
- اگر طراحی بعداً تغییر کرد، نسخه‌ی تازه را جایگزین همین فایل‌ها کنید.
