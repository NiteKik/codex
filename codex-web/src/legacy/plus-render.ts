import { parseSessionPayload } from "../utils/session-parser.ts";

const featureItems = [
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M8.448 8.218c.077-.229.4-.229.477 0l.363 1.09a1.5 1.5 0 0 0 .942.942l1.09.363c.229.076.229.401 0 .477l-1.09.363a1.5 1.5 0 0 0-.942.942l-.363 1.09c-.077.229-.4.229-.477 0l-.363-1.09a1.5 1.5 0 0 0-.942-.942l-1.09-.363c-.23-.076-.23-.401 0-.477l1.09-.363a1.5 1.5 0 0 0 .942-.942l.363-1.09Z"></path><path d="M12.072 6.108c.048-.143.25-.143.298 0l.228.68c.109.33.366.588.695.697l.682.226c.143.048.143.251 0 .299l-.682.226a1.11 1.11 0 0 0-.695.697l-.228.68c-.048.143-.25.143-.298 0l-.226-.68a1.11 1.11 0 0 0-.696-.697l-.68-.226c-.144-.048-.144-.251 0-.299l.68-.226c.33-.11.589-.367.697-.697l.225-.68Z"></path><path d="M9 1.818a2.42 2.42 0 0 1 2.132.071l5.454 3.154a2.33 2.33 0 0 1 1.005 1.882v6.15a2.33 2.33 0 0 1-1.005 1.882l-5.454 3.154a2.42 2.42 0 0 1-2.264 0l-5.327-3.075a2.42 2.42 0 0 1-1.132-1.96V6.925c0-.809.431-1.557 1.132-1.961l5.327-3.075.132-.071Z"></path></svg>`,
    text: "CodeX执行专业分析",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.887 7.173a4 4 0 0 1 5.655 5.654 4 4 0 0 1-5.654 0L9.99 10.94l-1.877 1.887a4 4 0 0 1-5.654-5.654 4 4 0 0 1 5.654 0L9.99 9.06l1.898-1.887ZM7.173 8.113a2.667 2.667 0 1 0-3.774 3.773l1.886-1.896 1.888-1.877Zm9.428 0a2.667 2.667 0 0 0-3.773 0L10.94 9.99l1.887 1.896a2.667 2.667 0 1 0 3.774-3.773Z"></path></svg>`,
    text: "网页对话 GPT-5.4 基础模型权限（无 5.4 Pro）",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 10.168A1.5 1.5 0 0 1 11.5 11.666c0 .588-.34 1.096-.835 1.34v1.16a.665.665 0 1 1-1.33 0v-1.16A1.49 1.49 0 0 1 8.5 11.666 1.5 1.5 0 0 1 10 10.168Z"></path><path d="M10 1.835a4.83 4.83 0 0 1 4.831 4.832v.265c.274.05.53.124.772.247.497.304.9.74 1.165 1.261.144.336.21.697.242 1.097.037.45.036 1.007.036 1.696v2c0 .69 0 1.246-.036 1.696-.032.4-.098.76-.242 1.097a2.99 2.99 0 0 1-1.165 1.261c-.376.192-.783.271-1.241.308-.45.036-1.008.036-1.696.036H7.333c-.689 0-1.246 0-1.696-.036-.458-.037-.864-.116-1.241-.308a2.99 2.99 0 0 1-1.261-1.165c-.192-.377-.271-.783-.308-1.241-.037-.45-.036-1.007-.036-1.696v-2c0-.69 0-1.246.036-1.696.037-.458.116-.864.308-1.24.265-.522.669-.959 1.165-1.262.2-.085.409-.141.629-.18v-.265A4.83 4.83 0 0 1 10 1.835Zm0 1.33A3.5 3.5 0 0 0 6.498 6.667v.17c.254-.003.532-.002.835-.002h5.333c.303 0 .581 0 .835.002v-.17A3.5 3.5 0 0 0 10 3.165Z"></path></svg>`,
    text: "个人账号升级，官网可查",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="m15.402 5.172-5-2.187a1 1 0 0 0-.803 0L4.6 5.172a1.09 1.09 0 0 0-.602.918v4.743c0 4.05 3.282 7.332 7.331 7.332 4.049 0 7.332-3.282 7.332-7.332V6.09c0-.398-.236-.758-.6-.918ZM10 10.168a1.627 1.627 0 1 1 0-3.254 1.627 1.627 0 0 1 0 3.254Zm0 5.83a5.18 5.18 0 0 1-3.466-1.327A4.3 4.3 0 0 1 10 13.999c1.416 0 2.674.68 3.466 1.732A5.18 5.18 0 0 1 10 15.999Z"></path></svg>`,
    text: "售后 30 天，支持风控阶梯退款",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.432 15.02c.888-.998 1.332-1.496 1.868-1.715a3.33 3.33 0 0 1 1.49-.126c.566.126 1.087.543 2.13 1.377l3.746 2.998c.55.44 1.26.637 1.957.544l.829-.11c1.39-.17 2.085-.255 2.583-.591a2.66 2.66 0 0 0 1.107-1.253c.205-.564.12-1.259-.05-2.649l-.345-2.812c-.17-1.39-.255-2.084-.591-2.582a2.67 2.67 0 0 0-1.253-1.108c-.564-.205-1.259-.12-2.649.05L10.44 7.388c-1.39.17-2.084.255-2.582.591A2.67 2.67 0 0 0 6.75 9.233c-.205.564-.12 1.26.05 2.649l.154 1.255"></path><path d="M16.916.871c-.024-.211-.202-.37-.415-.37-.212 0-.391.158-.415.37-.152 1.318-.896 2.062-2.214 2.214-.211.024-.37.203-.37.415 0 .213.159.392.37.415 1.3.147 2.096.884 2.213 2.203.019.216.2.381.417.381.216 0 .397-.166.416-.382.112-1.3.9-2.088 2.2-2.2.216-.019.382-.2.382-.416 0-.217-.166-.398-.382-.417-1.319-.117-2.056-.913-2.203-2.213Z"></path><circle cx="8.912" cy="10.022" r="1.25"></circle></svg>`,
    text: "生成图片、视频、幻灯片等",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.625 3.75a1.875 1.875 0 1 0 0 3.75 1.875 1.875 0 0 0 0-3.75Zm8.75 8.75a1.875 1.875 0 1 0 0 3.75 1.875 1.875 0 0 0 0-3.75Zm-8.75-10a3.125 3.125 0 0 1 3.443 2.71c.669.001 1.173.005 1.559.03.238.015.405.036.522.06.06.013.097.026.118.033l.019.007c.328.211.465.623.329.99-.012.018-.034.05-.074.096-.079.09-.2.208-.381.363-.367.314-.898.712-1.65 1.276l-.984.743c-.289.222-.539.42-.748.599-.388.332-.777.709-.945 1.163l-.067.207c-.267.975.08 2.018.88 2.637l.178.126c.407.262.944.33 1.454.363.439.028.993.032 1.666.033A3.542 3.542 0 0 0 14.375 17.916a3.541 3.541 0 0 0 3.542-3.541 3.541 3.541 0 0 0-3.542-3.542c-1.668 0-3.066 1.153-3.441 2.706-.67-.001-1.174-.004-1.56-.03-.237-.015-.404-.036-.521-.06-.12-.026-.149-.047-.137-.04l-.114-.089a1 1 0 0 1-.254-.762l.038-.139c-.005.014.004-.02.084-.113.078-.09.2-.208.381-.363.183-.157.408-.335.68-.544l.968-.731c.732-.55 1.315-.986 1.733-1.344.34-.29.68-.615.873-.996l.073-.167c.407-1.1-.005-2.334-.99-2.97l-.159-.089c-.382-.189-.85-.245-1.296-.274-.439-.028-.993-.032-1.665-.033A3.542 3.542 0 0 0 5.625 2.083 3.542 3.542 0 0 0 2.083 5.625 3.542 3.542 0 0 0 5.625 9.166Z"></path></svg>`,
    text: "DALL·E 绘图、高级语音对话",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M15.585 6.5c0-.711 0-1.204-.032-1.588-.023-.282-.06-.472-.111-.615l-.056-.13a1.665 1.665 0 0 0-.676-.731l-.126-.07c-.158-.081-.37-.138-.745-.169-.384-.031-.877-.032-1.588-.032h-4.5c-.711 0-1.204 0-1.588.032-.282.023-.472.06-.615.111l-.13.056a1.665 1.665 0 0 0-.731.676l-.07.126c-.081.158-.138.37-.169.745-.031.384-.032.877-.032 1.588v9.635l.416-.333c.222-.152.449-.278.712-.35.36-.074.734-.062 1.09.037.186.073.354.173.52.287.215.147.46.343.75.575l.418.334.403-.32c.124-.096.24-.182.348-.255.221-.152.447-.278.71-.35.36-.074.734-.062 1.09.037.186.073.354.173.52.287.215.147.46.343.75.575l.417.334.418-.334c.29-.232.536-.428.75-.575.221-.152.447-.278.71-.35.36-.074.734-.062 1.09.037.185.073.353.173.519.287l.417.334V6.5ZM7.917 10.168h2.5a.665.665 0 1 1 0 1.33h-2.5a.665.665 0 1 1 0-1.33Zm0-3.333h4.166a.665.665 0 1 1 0 1.33H7.917a.665.665 0 1 1 0-1.33Z"></path><path d="M3.085 17.5a.665.665 0 0 0 1.08.52l.805-.642c.305-.244.506-.404.671-.517.158-.109.246-.148.312-.166l.133-.026a.987.987 0 0 1 .244.026c.05.025.112.062.191.116.165.113.366.273.67.517l.418.334a.665.665 0 0 0 .832 0l.418-.334c.304-.244.505-.404.67-.517.158-.109.246-.148.312-.166l.132-.026c.124-.018.27-.01.4.026l.122.049c.05.025.11.062.19.116.166.113.367.273.671.517l.418.334a.665.665 0 0 0 .832 0l.417-.334c.305-.244.506-.404.671-.517.158-.109.246-.148.312-.166l.133-.026a.987.987 0 0 1 .244.026l.122.049c.05.025.11.062.19.116.166.113.367.273.672.517l.805.642a.665.665 0 0 0 1.08-.52v-11c0-.69 0-1.246-.036-1.696-.032-.4-.098-.76-.242-1.097a2.994 2.994 0 0 0-1.165-1.261 3.073 3.073 0 0 0-1.24-.309c-.45-.036-1.008-.036-1.697-.036h-4.5c-.69 0-1.246 0-1.696.036-.458.037-.864.116-1.241.308a2.994 2.994 0 0 0-1.26 1.165c-.193.377-.272.783-.31 1.24-.035.45-.035 1.007-.035 1.696v11Z"></path></svg>`,
    text: "个人专属，独立使用",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M17.919 9.335a.665.665 0 0 1 .665.665v1.296a.665.665 0 1 1-1.33 0v-.631H15.25v5.337h.585a.665.665 0 1 1 0 1.33h-2.5a.665.665 0 1 1 0-1.33h.585v-5.337h-2.003v.631a.665.665 0 1 1-1.33 0V10a.665.665 0 0 1 .665-.665h6.667Zm-12.5-6.667a.665.665 0 0 1 .665.665v10a.665.665 0 1 1-1.33 0v-10a.665.665 0 0 1 .665-.665Zm2.916 2.5A.665.665 0 0 1 9 5.833v5a.665.665 0 1 1-1.33 0v-5a.665.665 0 0 1 .665-.665ZM2.502 6.835a.665.665 0 0 1 .665.665v1.666a.665.665 0 1 1-1.33 0V7.5a.665.665 0 0 1 .665-.665Zm8.75-3.334a.665.665 0 0 1 .665.665v2.917a.665.665 0 1 1-1.33 0V4.166a.665.665 0 0 1 .665-.665Z"></path></svg>`,
    text: "保护隐私；数据不用于模型训练",
  },
  {
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 12.668c1.733 0 3.331.501 4.512 1.345 1.179.842 1.987 2.066 1.987 3.487a.665.665 0 0 1-1.33 0c0-.88-.5-1.74-1.43-2.405-.93-.664-2.25-1.097-3.739-1.097-1.488 0-2.808.432-3.738 1.097-.932.665-1.43 1.525-1.43 2.405a.665.665 0 0 1-1.33 0c0-1.421.807-2.645 1.987-3.487 1.181-.843 2.778-1.345 4.512-1.345Zm-2.083-7.668a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm4.166 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"></path><path d="M10 1.002c.367 0 .665.298.665.665v.585h2.446c.443 0 .814 0 1.116.023.31.025.606.078.888.217.46.227.833.6 1.06 1.06.138.281.192.577.216.888.024.302.024.673.024 1.116 0 .896 0 1.608-.046 2.181-.046.58-.143 1.076-.367 1.531a3.839 3.839 0 0 1-1.817 1.817c-.455.224-.951.321-1.531.367-.573.045-1.285.045-2.181.045h-.946c-.896 0-1.607 0-2.18-.045-.58-.046-1.077-.143-1.532-.367a3.839 3.839 0 0 1-1.817-1.817c-.224-.455-.32-.951-.367-1.531-.045-.573-.045-1.285-.045-2.181 0-.443 0-.814.023-1.116.025-.31.078-.606.217-.888.226-.46.6-.833 1.06-1.06.28-.139.576-.192.888-.217.302-.023.673-.023 1.116-.023h2.446v-.585c0-.367.298-.665.665-.665Zm-3.111 2.58c-.464 0-.774 0-1.012.02-.23.018-.336.05-.403.083a.996.996 0 0 0-.455.455c-.033.067-.065.174-.083.404-.019.237-.02.547-.02 1.011 0 .918 0 1.568.041 2.076.04.5.116.807.235 1.048a2.512 2.512 0 0 0 1.193 1.193c.241.119.548.195 1.049.235.508.04 1.157.041 2.076.041h.945c.918 0 1.568 0 2.076-.041.5-.04.807-.116 1.048-.235a2.51 2.51 0 0 0 1.193-1.193c.12-.241.195-.548.235-1.048.04-.508.041-1.158.041-2.076 0-.464 0-.774-.02-1.012-.018-.23-.05-.336-.082-.403a.996.996 0 0 0-.455-.455c-.067-.033-.174-.065-.404-.083-.237-.019-.547-.02-1.011-.02H6.889Z"></path></svg>`,
    text: "部署代理进行编码与深度研究",
  },
] as const;

export const renderPlusPage = (container: HTMLElement) => {
  container.innerHTML = `
    <div class="page-shell">
      <div class="plan-content plan-visible plan-active" data-plan="plus">
        <div class="plan-main">
          <div class="badge">ChatGPT Plus 订阅 · 自助开通</div>
          <h1>ChatGPT Plus 订阅</h1>
          <p class="hero-subtitle">
            ¥19.98 元每月，个人账号直升 Plus。同一邮箱三十天内只可开通一次，到期后可续订，可与 Team 共存。
          </p>

          <div class="stats">
            <div class="stat">
              <div class="stat-price-wrap">
                <strong>¥19.98</strong>
              </div>
              <span>💰 成本价格</span>
            </div>
            <div class="stat">
              <strong>1 分钟</strong>
              <span>⚡ 自助开通</span>
            </div>
            <div class="stat">
              <strong class="stat-title-with-help">
                暂无质保
                <button
                  type="button"
                  id="plusBlindBoxHelpBtn"
                  class="help-icon"
                  aria-label="暂无质保说明"
                  data-dialog-target="plusBlindBoxDialog"
                >
                  ?
                </button>
              </strong>
              <span>🤖 实测无风控可用满月</span>
            </div>
          </div>

          <div class="cta-card">
            <form id="plusPreorderForm">
              <div id="plusSessionWrap" class="plus-session-wrap">
                <label class="field-label" for="plusSessionInput">
                  <span>个人账号 Session</span>
                  <button
                    type="button"
                    class="field-label-help"
                    id="plusHowToGetSession"
                    data-dialog-target="plusSessionDialog"
                  >
                    如何获取？
                  </button>
                </label>
                <textarea
                  id="plusSessionInput"
                  class="plus-session-textarea"
                  rows="3"
                  spellcheck="false"
                  placeholder="打开 https://chatgpt.com/api/auth/session，切换到个人空间，复制页面全部内容粘贴到此处"
                ></textarea>
                <div id="plusSessionHint" class="plus-session-hint" aria-live="polite"></div>
                <div id="plusSessionInfo" class="plus-session-info" aria-live="polite">
                  <div class="plus-session-info__icon">✓</div>
                  <div class="plus-session-info__detail">
                    <div id="plusSessionEmail" class="plus-session-info__email">-</div>
                    <div id="plusSessionStatus" class="plus-session-info__status">
                      Session 检测成功，账户可开通本服务。（若该账号还有 Plus 未过期，请等待过期后再开通。）
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" id="plusSubmitBtn" class="primary-btn" disabled>
                支付 19.98 元开通
              </button>

              <p class="form-note">
                温馨提示：粘贴 Session 后自动识别账户邮箱。支付成功后系统将使用该凭证为您的账号开通 Plus 订阅。
              </p>
            </form>
          </div>
        </div>

        <div class="hero-right">
          <div class="hero-card">
            <p class="hero-card__eyebrow">限时套餐</p>
            <h3>ChatGPT Plus</h3>
            <div class="price">¥19.98 <span class="period">/ 月</span></div>

            <ul class="feature-stack">
              ${featureItems
                .map(
                  ({ icon, text }) => `
                    <li class="feature-item">
                      <div class="feature-icon">${icon}</div>
                      <span>${text}</span>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          </div>
        </div>
      </div>
    </div>

    <dialog id="plusSessionDialog" class="help-dialog">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">如何获取</p>
            <h2>个人账号 Session</h2>
          </div>
          <button type="button" class="dialog-close" data-close-dialog aria-label="关闭">
            ×
          </button>
        </div>
        <ol class="dialog-list">
          <li>登录 <code>chatgpt.com</code>，并确认当前切换到个人空间而不是 Team 空间。</li>
          <li>在新标签页打开 <code>https://chatgpt.com/api/auth/session</code>。</li>
          <li>复制页面返回的完整 JSON 内容。</li>
          <li>粘贴回当前输入框，系统会自动识别账号邮箱。</li>
        </ol>
      </div>
    </dialog>

    <dialog id="plusBlindBoxDialog" class="help-dialog">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">说明</p>
            <h2>暂无质保</h2>
          </div>
          <button type="button" class="dialog-close" data-close-dialog aria-label="关闭">
            ×
          </button>
        </div>
        <p class="dialog-copy">
          这里按你给的参考样式保留了“暂无质保”的状态说明。实际售后条款、退款规则和活动文案建议以后端配置或结算页文案为准。
        </p>
      </div>
    </dialog>

    <div id="plusHeroToast" class="toast hidden" role="status" aria-live="polite"></div>
  `;

  const plusPreorderForm = document.getElementById("plusPreorderForm");
  const plusSessionWrap = document.getElementById("plusSessionWrap");
  const plusSessionInput = document.getElementById("plusSessionInput");
  const plusSessionHint = document.getElementById("plusSessionHint");
  const plusSessionInfo = document.getElementById("plusSessionInfo");
  const plusSessionEmail = document.getElementById("plusSessionEmail");
  const plusSessionStatus = document.getElementById("plusSessionStatus");
  const plusSubmitBtn = document.getElementById("plusSubmitBtn");
  const plusHeroToast = document.getElementById("plusHeroToast");

  if (
    !(plusPreorderForm instanceof HTMLFormElement) ||
    !(plusSessionWrap instanceof HTMLDivElement) ||
    !(plusSessionInput instanceof HTMLTextAreaElement) ||
    !(plusSessionHint instanceof HTMLDivElement) ||
    !(plusSessionInfo instanceof HTMLDivElement) ||
    !(plusSessionEmail instanceof HTMLDivElement) ||
    !(plusSessionStatus instanceof HTMLDivElement) ||
    !(plusSubmitBtn instanceof HTMLButtonElement) ||
    !(plusHeroToast instanceof HTMLDivElement)
  ) {
    throw new Error("Required Plus page elements were not found.");
  }

  let toastTimer: number | undefined;

  const showToast = (message: string, tone: "error" | "success" = "error") => {
    plusHeroToast.textContent = message;
    plusHeroToast.dataset.tone = tone;
    plusHeroToast.classList.remove("hidden");

    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
      plusHeroToast.classList.add("hidden");
    }, 2800);
  };

  const syncSessionState = () => {
    const value = plusSessionInput.value.trim();
    const result = parseSessionPayload(value);
    const isBlank = value.length === 0;

    plusSessionWrap.classList.toggle("is-valid", result.ok);
    plusSessionWrap.classList.toggle("is-invalid", !result.ok && !isBlank);
    plusSessionInfo.classList.toggle("is-visible", result.ok);
    plusSubmitBtn.disabled = !result.ok;

    if (result.ok) {
      plusSessionEmail.textContent = result.email;
      plusSessionStatus.textContent =
        "Session 检测成功，账户可开通本服务。（若该账号还有 Plus 未过期，请等待过期后再开通。）";
      plusSessionHint.textContent = "";
      return;
    }

    plusSessionEmail.textContent = "-";
    plusSessionHint.textContent = isBlank ? "" : result.message;
  };

  plusSessionInput.addEventListener("input", syncSessionState);

  plusPreorderForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const result = parseSessionPayload(plusSessionInput.value);

    if (!result.ok) {
      showToast("请先粘贴有效的 Session 凭证");
      plusSessionInput.focus();
      syncSessionState();
      return;
    }

    showToast(
      `已识别账号 ${result.email}，当前页面已完成前端展示，可继续接入支付流程。`,
      "success",
    );
  });

  document.querySelectorAll<HTMLElement>("[data-dialog-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const dialogId = trigger.dataset.dialogTarget;
      const dialog = dialogId ? document.getElementById(dialogId) : null;

      if (dialog instanceof HTMLDialogElement) {
        dialog.showModal();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");

      if (dialog instanceof HTMLDialogElement) {
        dialog.close();
      }
    });
  });

  document.querySelectorAll<HTMLDialogElement>(".help-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const isInsideDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (!isInsideDialog) {
        dialog.close();
      }
    });
  });

  syncSessionState();
};
