// Biblioteca inicial de Edumon. BORRADOR: validadoPor queda en null hasta que
// orientación escolar o un psicólogo revise cada ficha, y las URL de las fuentes
// deben completarse con el enlace exacto del documento consultado.

const UNICEF = { nombre: 'UNICEF — Crianza positiva', url: null };
const OMS_PLH = { nombre: 'OMS / UNICEF — Parenting for Lifelong Health: consejos para la crianza', url: null };
const ICBF = { nombre: 'ICBF — Orientaciones para familias', url: null };
const MEN = { nombre: 'Ministerio de Educación Nacional — Familias y escuela', url: null };

export const FICHAS_CRIANZA = [
  {
    titulo: 'Disciplina sin golpes ni gritos',
    eje: 'crianza_amorosa', subtema: 'disciplina_positiva', edadMin: 1, edadMax: 18,
    contenido: 'Pegar, gritar o humillar detiene la conducta solo por un momento, pero enseña miedo y no enseña qué hacer en su lugar; además, en Colombia el castigo físico está prohibido (Ley 2089 de 2021). Funciona mejor: anticipar las reglas con calma, elogiar justo cuando hace lo correcto, y usar consecuencias lógicas y cortas (si raya la pared, la limpia contigo). Si sientes que vas a explotar, está bien alejarte unos minutos, respirar y volver cuando estés más tranquilo.',
    practica: 'Esta semana elige una conducta que quieras ver más (por ejemplo, recoger sus cosas) y cada vez que la haga dile exactamente qué hizo bien: "Gracias por guardar tus zapatos".',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Reparar después de perder la paciencia',
    eje: 'crianza_amorosa', subtema: 'disciplina_positiva', edadMin: 2, edadMax: 18,
    contenido: 'Todos los cuidadores pierden la paciencia alguna vez. Lo que más protege el vínculo no es no equivocarse nunca, sino reparar: cuando estés tranquilo, acércate, reconoce lo que pasó sin culpar al niño ("Te grité y no estuvo bien") y propón cómo lo harán distinto la próxima vez. Así le enseñas a manejar sus propios errores.',
    practica: 'La próxima vez que pierdas la paciencia, cuando estés calmado busca 5 minutos a solas con tu hijo para pedirle disculpas y acordar juntos una señal para calmarse los dos.',
    fuente: UNICEF,
  },
  {
    titulo: 'Rabietas en niños pequeños',
    eje: 'crianza_amorosa', subtema: 'rabietas', edadMin: 1, edadMax: 7,
    contenido: 'Las rabietas son normales en la primera infancia: el niño siente emociones muy grandes y todavía no tiene palabras ni control para manejarlas. Durante la rabieta, mantén la calma, cuida que esté seguro y no intentes razonar en ese momento. Nombra lo que siente ("Estás muy bravo porque querías seguir jugando") y mantén el límite con cariño. Cuando pase, abrázalo y hablen brevemente. Las rabietas se reducen cuando hay rutinas predecibles y se anticipan los cambios.',
    practica: 'Antes de cada cambio de actividad, avísale con tiempo: "En 5 minutos guardamos los juguetes para comer". Hazlo todos los días de esta semana.',
    fuente: UNICEF,
  },
  {
    titulo: 'Límites claros y con cariño',
    eje: 'crianza_amorosa', subtema: 'limites', edadMin: 3, edadMax: 18,
    contenido: 'Los límites dan seguridad a niños y adolescentes. Funcionan mejor cuando son pocos, claros, dichos en positivo ("Caminamos dentro de la casa" en lugar de "No corras") y se cumplen siempre igual. Explica brevemente el porqué, ofrece opciones dentro del límite ("¿Te bañas antes o después de comer?") y acuerda consecuencias razonables de antemano. Con adolescentes, negociar algunas reglas aumenta que las cumplan.',
    practica: 'Escojan juntos en familia tres reglas de la casa, escríbanlas en positivo en una hoja y péguenla en un lugar visible.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Pantallas en la niñez',
    eje: 'estilos_vida_saludable', subtema: 'pantallas', edadMin: 2, edadMax: 11,
    contenido: 'Las pantallas no son malas en sí, pero en la niñez desplazan el juego, el movimiento, el sueño y la conversación, que son claves para su desarrollo. Ayuda acordar horarios fijos y cortos, evitar pantallas durante las comidas y al menos una hora antes de dormir, ver contenidos con ellos y elegir programas apropiados para su edad. Los niños imitan: tu propio uso del celular también enseña.',
    practica: 'Esta semana definan un momento del día sin pantallas para toda la familia (por ejemplo, la comida) y úsenlo para conversar o jugar.',
    fuente: UNICEF,
  },
  {
    titulo: 'Celular y redes en la adolescencia',
    eje: 'estilos_vida_saludable', subtema: 'pantallas', edadMin: 12, edadMax: 18,
    contenido: 'En la adolescencia el celular es parte de su vida social, así que prohibirlo del todo suele generar conflicto y ocultamiento. Funciona mejor acordar reglas juntos (por ejemplo, el celular fuera del cuarto en la noche), conversar sin juzgar sobre lo que ven y con quién hablan, y enseñar a cuidar su privacidad: no compartir fotos íntimas, datos personales ni aceptar encuentros con desconocidos. Que sepa que puede contarte si algo en línea lo incomoda, sin que lo castigues por contarlo.',
    practica: 'Pídele a tu hijo que te muestre su aplicación o juego favorito durante 5 minutos, con curiosidad y sin criticar.',
    fuente: UNICEF,
  },
  {
    titulo: 'Acompañar las tareas sin hacerlas por ellos',
    eje: 'apoyo_procesos_educativos', subtema: 'tareas_estudio', edadMin: 5, edadMax: 18,
    contenido: 'Lo que más ayuda no es saber todas las respuestas, sino mostrar interés y crear una rutina: un lugar y una hora fijos para estudiar, sin televisión encendida, con pausas cortas. Pregunta qué está aprendiendo, celebra el esfuerzo más que la nota y, si no entiendes el tema, busquen juntos o escríbele al docente. Hacerle la tarea le quita la oportunidad de aprender.',
    practica: 'Esta semana, cada día pregúntale: "¿Qué fue lo más interesante que aprendiste hoy?" y escucha la respuesta sin corregir.',
    fuente: MEN,
  },
  {
    titulo: 'Cuando no quiere ir al colegio',
    eje: 'apoyo_procesos_educativos', subtema: 'rechazo_escolar', edadMin: 4, edadMax: 18,
    contenido: 'Cuando un niño o adolescente no quiere ir al colegio suele haber una razón: miedo, problemas con compañeros, dificultad con alguna materia, cansancio o tristeza. Pregunta con calma y sin regaño qué le preocupa, escucha sin minimizar ("eso no es nada") y habla con el docente para entender qué pasa en clase. Mantener la rutina de ir es importante, pero entender la causa es lo que lo resuelve. Si el rechazo es muy fuerte o se acompaña de dolores frecuentes o tristeza, busca apoyo de orientación escolar.',
    practica: 'Esta noche, antes de dormir, pregúntale: "¿Qué fue lo mejor y lo más difícil de tu día en el colegio?" y solo escucha.',
    fuente: MEN,
  },
  {
    titulo: 'Si tu hijo sufre acoso escolar',
    eje: 'garantia_derechos', subtema: 'acoso_escolar', edadMin: 5, edadMax: 18,
    contenido: 'El acoso escolar (matoneo) es cuando un estudiante recibe burlas, golpes, exclusión o ataques en línea de forma repetida. Si tu hijo te cuenta, créele, agradécele que confió en ti y dile que no es su culpa. No le pidas que responda con violencia. Informa al docente o al comité de convivencia del colegio: la Ley 1620 de 2013 obliga a las instituciones a activar una ruta de atención. Guarda pruebas si el acoso es por redes (capturas de pantalla).',
    practica: 'Dedica 5 minutos hoy a decirle a tu hijo, con tus palabras, que siempre puede contarte si alguien lo trata mal y que tú lo vas a apoyar.',
    fuente: ICBF,
  },
  {
    titulo: 'Hablar con un adolescente que no quiere hablar',
    eje: 'crianza_amorosa', subtema: 'comunicacion_adolescentes', edadMin: 11, edadMax: 18,
    contenido: 'Que un adolescente busque más privacidad es parte normal de crecer. La comunicación mejora cuando hay momentos sin presión (en el carro, cocinando juntos), cuando escuchas más de lo que aconsejas y cuando no reaccionas con sermones a lo que cuenta. Interésate por sus gustos, respeta su espacio y mantén pocas reglas claras. Si notas cambios fuertes y prolongados (aislamiento total, tristeza, no come o no duerme), busca apoyo profesional.',
    practica: 'Propónle una actividad corta que le guste (una canción, un video, cocinar algo) y compártanla sin preguntas de interrogatorio.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Sexualidad en la niñez: cuidar su cuerpo',
    eje: 'educacion_sexualidad', subtema: 'sexualidad', edadMin: 3, edadMax: 10,
    contenido: 'Hablar de sexualidad con niños empieza por enseñar los nombres correctos de las partes del cuerpo, que su cuerpo es suyo, que nadie debe tocar sus partes íntimas ni pedirle secretos sobre su cuerpo, y que siempre puede contarte si alguien lo incomoda. Responde sus preguntas con calma y de forma sencilla según su edad. Esto lo protege del abuso y le muestra que puede confiar en ti.',
    practica: 'Esta semana enséñale la regla de "secretos buenos y secretos malos": las sorpresas alegres se guardan, pero si un secreto lo hace sentir mal o es sobre su cuerpo, siempre te lo cuenta.',
    fuente: UNICEF,
  },
  {
    titulo: 'Sexualidad en la adolescencia',
    eje: 'educacion_sexualidad', subtema: 'sexualidad', edadMin: 11, edadMax: 18,
    contenido: 'En la adolescencia surgen cambios del cuerpo, atracciones y primeras relaciones. Los adolescentes que pueden hablar con su familia sobre sexualidad toman decisiones más cuidadosas. Habla sin burlas ni amenazas, comparte tus valores y también información sobre consentimiento, respeto en las relaciones, prevención del embarazo y de infecciones. Si no sabes algo, busquen juntos información confiable o pregunten en orientación escolar.',
    practica: 'Aprovecha una noticia, serie o canción para preguntarle qué piensa sobre el respeto en las relaciones de pareja, y escucha su opinión antes de dar la tuya.',
    fuente: UNICEF,
  },
  {
    titulo: 'Rutinas para dormir bien',
    eje: 'estilos_vida_saludable', subtema: 'sueno', edadMin: 1, edadMax: 18,
    contenido: 'Dormir bien influye en el ánimo, la conducta y el aprendizaje. Ayuda tener una hora fija para acostarse y levantarse (también los fines de semana), una rutina tranquila antes de dormir (baño, cuento, conversación), apagar pantallas al menos una hora antes y que el cuarto esté oscuro y en silencio. Las pesadillas ocasionales son normales: consuélalo y acompáñalo hasta que se calme.',
    practica: 'Esta semana creen juntos una rutina de 3 pasos para antes de dormir y dibújenla o escríbanla para que la siga cada noche.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Comer en familia sin peleas',
    eje: 'estilos_vida_saludable', subtema: 'alimentacion', edadMin: 1, edadMax: 18,
    contenido: 'Obligar, premiar con dulces o castigar a la hora de comer suele empeorar la relación con la comida. Funciona mejor: ofrecer comidas variadas en horarios regulares, comer juntos sin pantallas, dejar que decida cuánto come de lo que se sirve y volver a ofrecer alimentos nuevos varias veces sin presión. Si notas pérdida de peso, que deja de comer por días o preocupación excesiva por su cuerpo, consulta al servicio de salud.',
    practica: 'Esta semana invita a tu hijo a ayudarte a preparar una comida sencilla; los niños prueban más lo que ayudan a cocinar.',
    fuente: UNICEF,
  },
  {
    titulo: 'Acompañar las emociones difíciles',
    eje: 'crianza_amorosa', subtema: 'emociones', edadMin: 2, edadMax: 18,
    contenido: 'Todas las emociones son válidas, aunque no todas las conductas lo sean. Cuando tu hijo está triste, con miedo o con rabia, ayúdale a ponerle nombre a lo que siente, escúchalo sin minimizar y luego busquen juntos qué hacer. Evita frases como "no llores" o "eso no da miedo". Si la tristeza, el miedo o la irritabilidad duran varias semanas o afectan su vida diaria, busca apoyo de orientación escolar o del servicio de salud.',
    practica: 'Esta semana, al final del día, cuéntense mutuamente una emoción que sintieron y qué la provocó. Empieza tú para darle el ejemplo.',
    fuente: UNICEF,
  },
  {
    titulo: 'Cuidar al cuidador',
    eje: 'crianza_amorosa', subtema: 'autocuidado_cuidador', edadMin: 0, edadMax: 25,
    contenido: 'Criar cansa, y el estrés del cuidador hace más difícil tener paciencia. Cuidarte no es egoísmo: es parte de cuidar a tus hijos. Busca pequeños momentos para ti, pide y acepta ayuda de familiares o amigos, duerme lo que puedas y habla con alguien de confianza sobre cómo te sientes. Si sientes que ya no puedes más, la tristeza no se va o tienes pensamientos de hacerte daño, busca ayuda profesional: no tienes que pasar por esto sola o solo.',
    practica: 'Hoy regálate 5 minutos solo para ti: respira lento, toma algo caliente o sal a caminar, y nota cómo te sientes después.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Derechos de los niños y rutas de protección',
    eje: 'garantia_derechos', subtema: 'derechos_proteccion', edadMin: 0, edadMax: 18,
    contenido: 'Niños, niñas y adolescentes tienen derecho a vivir sin violencia, a la educación, a la salud y a ser escuchados (Ley 1098 de 2006, Código de Infancia y Adolescencia). La familia, el colegio y el Estado son corresponsables de protegerlos. Si conoces una situación de riesgo, puedes acudir al ICBF (línea 141), a la Comisaría de Familia de tu municipio o al comité de convivencia del colegio.',
    practica: 'Guarda en tu celular la línea 141 del ICBF y el contacto de orientación escolar del colegio, y cuéntale a tu hijo a quién puede acudir si necesita ayuda.',
    fuente: ICBF,
  },

  // ─── Fichas por edad para subtemas existentes ──────────────────────────────
  {
    titulo: 'Explosiones de rabia en niños escolares',
    eje: 'crianza_amorosa', subtema: 'rabietas', edadMin: 7, edadMax: 12,
    contenido: 'A esta edad las explosiones de rabia suelen aparecer cuando el niño se siente frustrado, cansado, injustamente tratado o con demasiadas exigencias. En el momento, baja tu voz, no discutas y dale espacio para calmarse en un lugar seguro. Cuando esté tranquilo, hablen de qué pasó, qué sintió en el cuerpo y qué puede hacer la próxima vez (respirar, alejarse, pedir ayuda con palabras). Mantén las consecuencias que ya estaban acordadas, sin agregar castigos en caliente. Si las explosiones son muy frecuentes, lastima a otros o afectan el colegio, busca apoyo de orientación escolar.',
    practica: 'En un momento tranquilo, armen juntos un "plan de calma" con 3 cosas que le ayudan cuando se enoja (por ejemplo, tomar agua, apretar un cojín, contar hasta 10) y pónganlo en la nevera.',
    fuente: UNICEF,
  },
  {
    titulo: 'Normas y permisos en la adolescencia',
    eje: 'crianza_amorosa', subtema: 'limites', edadMin: 12, edadMax: 18,
    contenido: 'Los adolescentes necesitan límites tanto como los niños, pero aceptan mejor los que entienden y ayudan a construir. Negocia lo negociable (hora de llegada, uso del celular, salidas) y mantén firmes los temas de seguridad (saber dónde y con quién está, no subirse a un vehículo con alguien que tomó). Explica tus razones, escucha las suyas y acuerden de antemano qué pasa si no se cumple. Aumenta la libertad a medida que demuestra responsabilidad. Evita los sermones largos y las comparaciones: la relación de confianza es tu mejor herramienta de protección.',
    practica: 'Esta semana siéntense 10 minutos a acordar una sola norma (por ejemplo, la hora de llegada del fin de semana): cada uno propone, lleguen a un acuerdo y escríbanlo.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Cuando miente',
    eje: 'crianza_amorosa', subtema: 'limites', edadMin: 4, edadMax: 18,
    contenido: 'Mentir es común en la niñez y la adolescencia: muchas veces lo hacen por miedo al castigo, para no decepcionarte o para proteger su privacidad. Si cada verdad trae un regaño fuerte, aprenden a esconder. Ayuda reconocer cuando dicen la verdad aunque sea difícil ("Gracias por contarme, eso es valiente"), separar la conducta de la persona (no decirle "mentiroso") y aplicar una consecuencia lógica y tranquila sobre lo que hizo, no sobre haberlo contado. Tu propio ejemplo cuenta: evita pedirle que mienta por ti.',
    practica: 'Esta semana, cuando te cuente algo que hizo mal, respira antes de responder y empieza con: "Gracias por decirme la verdad". Luego hablen de cómo arreglarlo.',
    fuente: UNICEF,
  },
  {
    titulo: 'Cuando le va mal en el colegio',
    eje: 'apoyo_procesos_educativos', subtema: 'tareas_estudio', edadMin: 6, edadMax: 18,
    contenido: 'Las bajas notas son una señal, no una etiqueta. Antes de castigar, busca la causa con calma: puede que no entienda un tema, que tenga problemas para concentrarse, que esté cansado o triste, o que algo pase con sus compañeros. Pide una cita con el docente para entender en qué tiene dificultad y qué se puede hacer en casa. Reconoce el esfuerzo y los avances pequeños, y no lo compares con hermanos o compañeros. Si las dificultades persisten pese al apoyo, pregunta en orientación escolar si conviene una valoración.',
    practica: 'Siéntate con tu hijo 5 minutos y pregúntale: "¿Qué materia te cuesta más y por qué crees que te cuesta?". Escucha sin regañar y anota lo que diga para hablarlo con el docente.',
    fuente: MEN,
  },
  {
    titulo: 'Miedos y preocupaciones en la niñez',
    eje: 'crianza_amorosa', subtema: 'emociones', edadMin: 3, edadMax: 12,
    contenido: 'Los miedos son parte del desarrollo: a la oscuridad, a quedarse solo, a los monstruos o, más adelante, a equivocarse o a lo que pasa en las noticias. Burlarse o decir "no seas miedoso" no lo quita; tampoco evitar siempre lo que le da miedo. Funciona mejor escuchar, nombrar la emoción ("Te da miedo que me vaya"), darle información sencilla y acompañarlo a enfrentarlo en pasos pequeños, celebrando cada avance. Si el miedo o la preocupación le impiden dormir, ir al colegio o jugar durante varias semanas, consulta con orientación escolar o con el servicio de salud.',
    practica: 'Esta semana practiquen juntos la "respiración del globo" antes de dormir: inflar la barriga lento como un globo y soltar el aire despacio, 5 veces.',
    fuente: UNICEF,
  },
  {
    titulo: 'Tristeza y cambios de ánimo en adolescentes',
    eje: 'crianza_amorosa', subtema: 'emociones', edadMin: 12, edadMax: 18,
    contenido: 'En la adolescencia los cambios de ánimo son frecuentes, pero no todo es "la edad". Mantente cerca sin presionar: ofrece compañía, interésate por su mundo y escucha sin minimizar ni dar sermones. Señales para buscar ayuda pronto: tristeza o irritabilidad que dura más de dos semanas, se aísla de todos, deja lo que antes disfrutaba, cambia mucho su sueño o su alimentación, baja mucho en el colegio, consume alcohol o drogas, se lastima o habla de morir. En ese caso habla con orientación escolar o con el servicio de salud; si habla de quitarse la vida, busca ayuda de inmediato.',
    practica: 'Esta semana invítalo a algo sencillo que le guste (caminar, una comida, ver algo juntos) y, en algún momento, dile: "Te noto distinto últimamente, aquí estoy si quieres hablar".',
    fuente: UNICEF,
  },
  {
    titulo: 'Lonchera y onces saludables',
    eje: 'estilos_vida_saludable', subtema: 'alimentacion', edadMin: 3, edadMax: 18,
    contenido: 'Una lonchera saludable no tiene que ser costosa: una fruta entera o picada, un alimento que dé energía (pan, arepa, galletas sencillas o mazorca) y algo con proteína (queso, huevo, yogur o leche), más agua para beber. Conviene evitar a diario los paquetes, los dulces y las bebidas azucaradas, que llenan pero no alimentan. Involucrar a los niños en escoger entre opciones saludables hace que coman más lo que llevan. Si siempre vuelve llena, pregúntale por qué: puede que no le guste, que no tenga tiempo o que algo pase en el descanso.',
    practica: 'Esta semana, en la noche, deja que tu hijo escoja la fruta y el acompañamiento de la lonchera entre dos opciones que tú le ofrezcas.',
    fuente: UNICEF,
  },
  {
    titulo: 'El sueño en la adolescencia',
    eje: 'estilos_vida_saludable', subtema: 'sueno', edadMin: 12, edadMax: 18,
    contenido: 'En la adolescencia el reloj del cuerpo cambia y les da sueño más tarde, pero siguen necesitando dormir bastante; el celular en la noche lo empeora. Dormir poco afecta el ánimo, la concentración y las notas. Ayuda acordar que el celular duerma fuera del cuarto o en silencio a cierta hora, mantener horarios parecidos entre semana y fines de semana, y evitar bebidas con cafeína o energizantes en la tarde. Más que imponer, explícale para qué le sirve dormir bien y negocia el plan con él o ella.',
    practica: 'Propón un reto familiar de una semana: todos dejan el celular cargando en la sala a la misma hora de la noche, incluido tú.',
    fuente: OMS_PLH,
  },
  {
    titulo: 'Si tu hijo es quien molesta a otros',
    eje: 'garantia_derechos', subtema: 'acoso_escolar', edadMin: 5, edadMax: 18,
    contenido: 'Enterarse de que tu hijo molesta o agrede a compañeros es duro, pero es una oportunidad para ayudarlo. Escucha al colegio sin ponerte a la defensiva, habla con tu hijo con calma y deja claro que lastimar a otros no se acepta. Busca qué hay detrás: a veces imitan lo que ven, buscan aceptación del grupo o también están sufriendo. Ayúdalo a ponerse en el lugar del otro y a reparar el daño (pedir disculpas, devolver, ayudar). Trabaja en equipo con el docente y orientación escolar, y revisa cómo se resuelven los conflictos en casa.',
    practica: 'Esta semana, cuando vean juntos una serie o una situación, pregúntale: "¿Cómo crees que se sintió esa persona?". Practicar ponerse en el lugar del otro también se aprende.',
    fuente: ICBF,
  },
  {
    titulo: 'Adaptación al jardín o al colegio nuevo',
    eje: 'apoyo_procesos_educativos', subtema: 'rechazo_escolar', edadMin: 2, edadMax: 7,
    contenido: 'Llorar al separarse es normal en los primeros días o semanas de jardín o colegio. Ayuda prepararlo antes (contarle cómo será, visitar el lugar), hacer despedidas cortas y cariñosas, siempre con la misma frase, y no salir a escondidas, porque eso aumenta la desconfianza. Cumple lo que prometes ("te recojo después del almuerzo") y muéstrate tranquilo: los niños leen tus emociones. Habla con la docente sobre cómo pasa el día. Si después de varias semanas sigue muy angustiado, consúltalo con el colegio.',
    practica: 'Inventen juntos un "ritual de despedida" de menos de un minuto (un abrazo, un choque de manos y una frase) y úsenlo todos los días de esta semana.',
    fuente: MEN,
  },
  {
    titulo: 'Cuando ve contenido sexual en internet',
    eje: 'educacion_sexualidad', subtema: 'sexualidad', edadMin: 8, edadMax: 18,
    contenido: 'Muchos niños y adolescentes se encuentran con pornografía en internet, a veces sin buscarla. Si pasa, mantén la calma: regañar o avergonzar hace que no te vuelva a contar. Pregúntale qué vio y cómo se sintió, explícale que eso no muestra cómo son las relaciones reales, que en ellas hay respeto, cuidado y consentimiento, y que puede contarte siempre que algo lo incomode. Configura controles parentales según su edad, pero recuerda que la conversación protege más que cualquier filtro. Si un adulto le envió ese contenido o le pidió fotos, eso es un delito: busca ayuda en el colegio o en el ICBF.',
    practica: 'Esta semana revisen juntos la configuración de privacidad de una aplicación que use y acuerden qué hacer si alguien le envía algo que lo incomoda.',
    fuente: UNICEF,
  },

  // ─── Rutinas y organización ──────────────────────────────────────────────
  {
    titulo: 'Mañanas sin carreras antes del colegio',
    eje: 'apoyo_procesos_educativos', subtema: 'rutinas_organizacion', edadMin: 3, edadMax: 18,
    contenido: 'Las mañanas difíciles casi siempre empiezan la noche anterior. Ayuda dejar listos la ropa, la maleta y la lonchera antes de dormir, acostarse a una hora fija y levantarse con algo de margen. Una lista de pasos (con dibujos para los pequeños) le da autonomía y te evita repetir lo mismo diez veces. Dale tareas a su medida: los pequeños pueden ponerse los zapatos, los grandes alistar su desayuno. Evita las pantallas antes de salir y reconoce los días que salen a tiempo.',
    practica: 'Esta noche hagan juntos la lista de los pasos de la mañana y pónganla en un lugar visible. Mañana, en vez de recordarle cada paso, pregúntale: "¿Qué sigue en tu lista?".',
    fuente: MEN,
  },
  {
    titulo: 'Organización y responsabilidad con el estudio',
    eje: 'apoyo_procesos_educativos', subtema: 'rutinas_organizacion', edadMin: 8, edadMax: 18,
    contenido: 'Olvidar cuadernos, tareas o fechas es común mientras aprenden a organizarse; esa habilidad se enseña, no se exige de un día para otro. Ayuda tener un lugar fijo para la maleta y los útiles, revisar juntos la agenda o la plataforma del colegio a la misma hora cada día y dividir los trabajos largos en pasos con fecha. Al principio acompaña de cerca y poco a poco dale más autonomía. Si olvida algo, deja que viva la consecuencia razonable en el colegio en lugar de correr a resolverlo siempre.',
    practica: 'Esta semana, antes de dormir, dedíquenle 5 minutos a revisar juntos la agenda de mañana y alistar la maleta. Pídele que él o ella dirija la revisión.',
    fuente: MEN,
  },

  // ─── Relación con el colegio ───────────────────────────────────────────────
  {
    titulo: 'Hablar con el docente cuando hay un problema',
    eje: 'apoyo_procesos_educativos', subtema: 'relacion_colegio', edadMin: 3, edadMax: 18,
    contenido: 'Familia y colegio funcionan mejor como equipo. Si algo te preocupa, pide una cita en vez de reclamar en la puerta o por el grupo de chat. Antes, escucha la versión de tu hijo y anota hechos concretos (qué pasó, cuándo). En la reunión, empieza por lo que comparten: el bienestar del niño. Describe la situación sin acusar, escucha la mirada del docente y acuerden acciones concretas y una fecha para revisar cómo va. Si no se resuelve, puedes acudir a coordinación, orientación escolar o al comité de convivencia.',
    practica: 'Escríbele esta semana un mensaje corto y amable al docente para presentarte y preguntarle cómo ve a tu hijo; así el primer contacto no será por un problema.',
    fuente: MEN,
  },
  {
    titulo: 'Cuando te citan del colegio',
    eje: 'apoyo_procesos_educativos', subtema: 'relacion_colegio', edadMin: 3, edadMax: 18,
    contenido: 'Una citación o una anotación puede generar rabia o vergüenza, pero es una oportunidad para ayudar a tu hijo. Ve con disposición de escuchar, pregunta qué pasó exactamente y qué se ha intentado en el colegio. Luego habla con tu hijo con calma: escucha su versión antes de juzgar. Acuerden en familia y con el colegio un plan concreto, con consecuencias razonables y apoyo para cambiar. El castigo físico o la humillación en casa no corrigen la conducta en el colegio: suelen empeorarla.',
    practica: 'Después de la próxima reunión con el colegio, siéntate con tu hijo 5 minutos y acuerden juntos una sola meta para las próximas dos semanas.',
    fuente: MEN,
  },

  // ─── Hermanos ─────────────────────────────────────────────────────────────
  {
    titulo: 'Peleas entre hermanos',
    eje: 'crianza_amorosa', subtema: 'hermanos', edadMin: 2, edadMax: 18,
    contenido: 'Las peleas entre hermanos son normales y les enseñan a negociar, siempre que no haya golpes ni humillaciones. Evita hacer de juez buscando al culpable: describe lo que ves ("Veo dos niños que quieren el mismo juguete"), escucha a ambos y ayúdales a encontrar una solución. Interviene de inmediato si hay agresión, separándolos con calma. Evita comparaciones y etiquetas ("el juicioso", "el difícil") y busca tiempo a solas con cada uno: muchas peleas buscan tu atención.',
    practica: 'Esta semana regálale a cada hijo 10 minutos a solas contigo, haciendo algo que él o ella escoja, sin celular.',
    fuente: UNICEF,
  },
  {
    titulo: 'Celos por la llegada de un hermanito',
    eje: 'crianza_amorosa', subtema: 'hermanos', edadMin: 1, edadMax: 8,
    contenido: 'La llegada de un bebé cambia el mundo del hermano mayor, y es normal que sienta celos o vuelva a conductas de cuando era más pequeño (pedir tetero, hacerse pipí). Prepáralo antes del nacimiento, evita grandes cambios en esos días (como sacarlo de la cuna o empezar el jardín) e invítalo a ayudar con el bebé si quiere. Permítele expresar lo que siente ("A veces te da rabia que el bebé ocupe tanto a mamá") y asegúrale con hechos que lo sigues queriendo: tiempo exclusivo, abrazos y atención cuando se porta bien.',
    practica: 'Todos los días de esta semana, mientras el bebé duerme, dedica 10 minutos solo al hermano mayor y llámalos "nuestro tiempo especial".',
    fuente: UNICEF,
  },

  // ─── Separación, duelo y cambios ───────────────────────────────────────────
  {
    titulo: 'Acompañar a los hijos en una separación',
    eje: 'crianza_amorosa', subtema: 'cambios_familiares', edadMin: 2, edadMax: 18,
    contenido: 'Una separación es un cambio grande para los hijos, pero lo que más los afecta es el conflicto entre los adultos. Si es posible, cuéntenles juntos, con palabras sencillas y sin detalles de pareja, que no es su culpa y que ambos los siguen queriendo. No hablen mal del otro padre delante de ellos ni los usen como mensajeros. Mantengan rutinas estables y reglas parecidas en ambas casas. Es normal que estén tristes, enojados o que bajen en el colegio por un tiempo; si dura muchas semanas, busquen apoyo de orientación escolar. Si hay violencia, la prioridad es la seguridad.',
    practica: 'Esta semana dile a tu hijo, con tus palabras: "Lo que pasó entre papá y mamá no es tu culpa, y los dos te vamos a seguir queriendo siempre". Luego escucha si quiere decir algo.',
    fuente: UNICEF,
  },
  {
    titulo: 'Hablar de la muerte y acompañar el duelo',
    eje: 'crianza_amorosa', subtema: 'cambios_familiares', edadMin: 3, edadMax: 18,
    contenido: 'Cuando muere alguien cercano, los niños necesitan la verdad dicha con palabras simples: decir "murió" es más claro que "se durmió" o "se fue de viaje", que pueden confundir o asustar. Permíteles preguntar, llorar o jugar; cada uno vive el duelo a su manera y puede parecer que "no le afectó" y luego mostrar tristeza. Inclúyelos, si quieren, en los rituales de despedida. Tú también puedes llorar delante de ellos: les enseñas que está bien sentir. Si después de varios meses no logra retomar su vida diaria, busca apoyo profesional.',
    practica: 'Esta semana hagan juntos algo para recordar a esa persona: una carta, un dibujo o una caja con fotos y objetos, y conversen sobre un recuerdo bonito.',
    fuente: UNICEF,
  },
  {
    titulo: 'Mudanza, cambio de colegio o de país',
    eje: 'crianza_amorosa', subtema: 'cambios_familiares', edadMin: 3, edadMax: 18,
    contenido: 'Mudarse, cambiar de colegio o migrar implica dejar amigos, lugares y costumbres, aunque el cambio sea para bien. Anticípalo con tiempo y cuéntale el porqué con palabras sencillas, permítele despedirse y llevar sus cosas importantes, y mantén las rutinas de casa (comidas, hora de dormir) para darle seguridad. En el lugar nuevo, ayúdalo a conocer gente y habla con el colegio para que lo acompañen en la llegada. Es normal que extrañe y esté irritable unas semanas; escucha sin minimizar.',
    practica: 'Esta semana pregúntale qué es lo que más extraña y qué le gustaría conocer del lugar nuevo, y planeen juntos una salida para descubrir algo de allí.',
    fuente: UNICEF,
  },

  // ─── Alcohol, cigarrillo y drogas ──────────────────────────────────────────
  {
    titulo: 'Alcohol, cigarrillo, vapeador y drogas en la adolescencia',
    eje: 'estilos_vida_saludable', subtema: 'consumo_sustancias', edadMin: 10, edadMax: 18,
    contenido: 'En Colombia la venta de alcohol y cigarrillo a menores de edad está prohibida, y empezar a consumir temprano aumenta el riesgo de problemas de salud y adicción. Hablar del tema antes de que ocurra protege: pregunta qué saben y qué ven en su grupo, da información clara sin exagerar y explica tus reglas y por qué. Tu ejemplo pesa: evita ofrecerle "un traguito" en las fiestas. Si descubres que consumió, mantén la calma, habla cuando esté sobrio, escucha qué lo llevó a hacerlo y acuerden reglas y acompañamiento. Si el consumo se repite, si cambia mucho su comportamiento o mezcla sustancias, busca apoyo de orientación escolar o del servicio de salud.',
    practica: 'Aprovecha una noticia, una canción o una fiesta para preguntarle: "¿Qué harías si en una reunión te ofrecen alcohol o un vapeador?". Escucha y practiquen juntos cómo decir que no.',
    fuente: UNICEF,
  },
];
