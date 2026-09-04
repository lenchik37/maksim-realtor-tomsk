const allowedOrigins = new Set([
  "https://rieltor-maksim.webhunters.ru",
  "http://rieltor-maksim.webhunters.ru",
]);

const allowedAnswers = [
  new Set([
    "Понять, какую квартиру я могу купить в своём бюджете",
    "Сравнить новостройки и предложения разных застройщиков",
    "Разобраться в районах, жилых комплексах и планировках",
    "Получить профессиональную консультацию перед покупкой",
  ]),
  new Set([
    "Минимальная стоимость квартиры",
    "Удобный район и транспортная доступность",
    "Срок сдачи дома и возможность быстрого заселения",
    "Планировка, площадь, отделка и инфраструктура",
  ]),
  new Set([
    "Уже смотрю конкретные новостройки",
    "Хочу начать сравнивать варианты",
    "Пока изучаю районы и жилые комплексы",
    "Есть вопросы, которые хочу обсудить со специалистом",
  ]),
];

function json(body, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (url.pathname !== "/api/lead") return json({ ok: false }, 404, origin);

    if (request.method === "OPTIONS") {
      if (!allowedOrigins.has(origin)) return json({ ok: false }, 403, origin);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") return json({ ok: false }, 405, origin);
    if (!allowedOrigins.has(origin)) return json({ ok: false }, 403, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, message: "Некорректные данные" }, 400, origin);
    }

    if (body.website) return json({ ok: true }, 200, origin);

    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
    const digits = phone.replace(/\D/g, "");
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 3) : [];
    const validAnswers = answers.length === 3 && answers.every((answer, index) =>
      typeof answer === "string" && allowedAnswers[index].has(answer),
    );

    if (digits.length < 10 || digits.length > 15 || !validAnswers) {
      return json({ ok: false, message: "Проверьте номер телефона и ответы" }, 400, origin);
    }

    const safePhone = escapeHtml(phone);
    const safeAnswers = answers.map(escapeHtml);
    const createdAt = new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tomsk",
    }).format(new Date());

    const recipient = typeof env.LEAD_RECIPIENT === "string" ? env.LEAD_RECIPIENT.trim() : "";
    const sender = typeof env.LEAD_SENDER === "string" ? env.LEAD_SENDER.trim() : "";

    if (!recipient || !sender) {
      console.error("Email delivery configuration is missing");
      return json({ ok: false, message: "Не удалось отправить заявку" }, 502, origin);
    }

    try {
      await env.EMAIL.send({
        to: recipient,
        from: sender,
        subject: "Новая заявка с сайта — Максим Пивоваров",
        text: [
          "Новая заявка с сайта rieltor-maksim.webhunters.ru",
          `Телефон: ${phone}`,
          `Что хочет решить: ${answers[0]}`,
          `Что особенно важно: ${answers[1]}`,
          `Этап выбора: ${answers[2]}`,
          `Время: ${createdAt}`,
        ].join("\n"),
        html: `<h2>Новая заявка с сайта</h2><p><strong>Телефон:</strong> ${safePhone}</p><p><strong>Что хочет решить:</strong> ${safeAnswers[0]}</p><p><strong>Что особенно важно:</strong> ${safeAnswers[1]}</p><p><strong>Этап выбора:</strong> ${safeAnswers[2]}</p><p><strong>Время:</strong> ${createdAt}</p>`,
      });
      return json({ ok: true }, 200, origin);
    } catch (error) {
      console.error("Email delivery failed", error?.code || "unknown");
      return json({ ok: false, message: "Не удалось отправить заявку" }, 502, origin);
    }
  },
};
