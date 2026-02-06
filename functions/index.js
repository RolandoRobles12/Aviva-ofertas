// Firebase Functions para integración con HubSpot
// Archivo: functions/index.js

const functions = require('firebase-functions');
const axios = require('axios');

// Configuración - REEMPLAZA CON TU TOKEN
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_API_URL = 'https://api.hubapi.com';

// CORS configuration
const cors = require('cors')({ origin: true });

/**
 * Función para obtener los datos de un deal desde HubSpot
 * URL: https://YOUR-PROJECT.cloudfunctions.net/getDealData?deal_id=123456
 */
exports.getDealData = functions.https.onRequest(async (req, res) => {
  // Configurar CORS manualmente
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  return cors(req, res, async () => {
    try {
      const dealId = req.query.deal_id;
      
      if (!dealId) {
        return res.status(400).json({ error: 'deal_id es requerido' });
      }

      // Obtener datos del deal con las propiedades específicas
      const dealResponse = await axios.get(
        `${HUBSPOT_API_URL}/crm/v3/objects/deals/${dealId}`,
        {
          params: {
            properties: 'amount,periodos,pago_por_periodo,tasa_de_interes_semanal,dealname,ajuste_pantalla',
            associations: 'contacts'
          },
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const deal = dealResponse.data;
      
      // Verificar si ya fue procesado
      const yaProcesado = deal.properties.ajuste_pantalla === 'true' || deal.properties.ajuste_pantalla === true;
      
      // Obtener el contacto asociado para el nombre
      let contactName = 'Cliente';
      if (deal.associations && deal.associations.contacts && deal.associations.contacts.results.length > 0) {
        const contactId = deal.associations.contacts.results[0].id;
        
        const contactResponse = await axios.get(
          `${HUBSPOT_API_URL}/crm/v3/objects/contacts/${contactId}`,
          {
            params: {
              properties: 'firstname,lastname'
            },
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const contact = contactResponse.data;
        const firstName = contact.properties.firstname || '';
        const lastName = contact.properties.lastname || '';
        contactName = `${firstName} ${lastName}`.trim() || 'Cliente';
      }

      // Preparar respuesta con los datos del deal
      let tasaSemanal = parseFloat(deal.properties.tasa_de_interes_semanal) || 0.0288;
      
      // Si la tasa está en formato porcentaje (mayor a 1), convertir a decimal
      if (tasaSemanal > 1) {
        tasaSemanal = tasaSemanal / 100;
      }
      
      const responseData = {
        nombre: contactName,
        monto: parseFloat(deal.properties.amount) || 0,
        periodos: parseInt(deal.properties.periodos) || 0,
        pago: parseFloat(deal.properties.pago_por_periodo) || 0,
        tasa: tasaSemanal,
        dealName: deal.properties.dealname || '',
        yaProcesado: yaProcesado
      };

      return res.status(200).json(responseData);

    } catch (error) {
      console.error('Error al obtener datos del deal:', error.response?.data || error.message);
      return res.status(500).json({ 
        error: 'Error al obtener datos de HubSpot',
        details: error.response?.data || error.message
      });
    }
  });
});

/**
 * Función para actualizar el deal cuando el cliente acepta directamente
 * URL: https://YOUR-PROJECT.cloudfunctions.net/aceptarOferta
 */
exports.aceptarOferta = functions.https.onRequest(async (req, res) => {
  // Configurar CORS manualmente
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  return cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
      }

      const { deal_id, marcar_procesado, utm_source } = req.body;

      if (!deal_id) {
        return res.status(400).json({ error: 'deal_id es requerido' });
      }

      const properties = {
        dealstage: '34528397'
      };

      // Si se solicita, marcar como procesado
      if (marcar_procesado) {
        properties.ajuste_pantalla = 'true';
      }

      // Guardar canal de origen (whatsapp, email, etc.)
      if (utm_source) {
        properties.utm_source = utm_source;
      }

      // Actualizar el deal
      await axios.patch(
        `${HUBSPOT_API_URL}/crm/v3/objects/deals/${deal_id}`,
        { properties },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.status(200).json({ success: true, message: 'Oferta aceptada' });

    } catch (error) {
      console.error('Error al aceptar oferta:', error.response?.data || error.message);
      return res.status(500).json({ 
        error: 'Error al actualizar HubSpot',
        details: error.response?.data || error.message
      });
    }
  });
});

/**
 * Función para actualizar el deal cuando el cliente ajusta la oferta
 * URL: https://YOUR-PROJECT.cloudfunctions.net/ajustarOferta
 */
exports.ajustarOferta = functions.https.onRequest(async (req, res) => {
  // Configurar CORS manualmente
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  return cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
      }

      const {
        deal_id,
        nuevo_monto_solicitado,
        plazos_solicitados,
        monto_aprobado,
        periodos_finales,
        pago_final,
        marcar_procesado,
        utm_source
      } = req.body;

      if (!deal_id) {
        return res.status(400).json({ error: 'deal_id es requerido' });
      }

      const properties = {
        dealstage: '34528397',
        nuevo_monto_solicitado: nuevo_monto_solicitado,
        plazos_solcitados: plazos_solicitados,
        amount: monto_aprobado,
        periodos: periodos_finales,
        pago_por_periodo: pago_final
      };

      // Si se solicita, marcar como procesado
      if (marcar_procesado) {
        properties.ajuste_pantalla = 'true';
      }

      // Guardar canal de origen (whatsapp, email, etc.)
      if (utm_source) {
        properties.utm_source = utm_source;
      }

      // Actualizar el deal con los nuevos valores
      await axios.patch(
        `${HUBSPOT_API_URL}/crm/v3/objects/deals/${deal_id}`,
        { properties },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.status(200).json({ success: true, message: 'Oferta ajustada correctamente' });

    } catch (error) {
      console.error('Error al ajustar oferta:', error.response?.data || error.message);
      return res.status(500).json({ 
        error: 'Error al actualizar HubSpot',
        details: error.response?.data || error.message
      });
    }
  });
});

/**
 * Función para rechazar la oferta
 * URL: https://YOUR-PROJECT.cloudfunctions.net/rechazarOferta
 */
exports.rechazarOferta = functions.https.onRequest(async (req, res) => {
  // Configurar CORS manualmente
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  return cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
      }

      const { deal_id, utm_source } = req.body;

      if (!deal_id) {
        return res.status(400).json({ error: 'deal_id es requerido' });
      }

      const properties = {};

      // Guardar canal de origen (whatsapp, email, etc.)
      if (utm_source) {
        properties.utm_source = utm_source;
      }

      await axios.patch(
        `${HUBSPOT_API_URL}/crm/v3/objects/deals/${deal_id}`,
        { properties },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return res.status(200).json({ success: true, message: 'Oferta rechazada' });

    } catch (error) {
      console.error('Error al rechazar oferta:', error.response?.data || error.message);
      return res.status(500).json({ 
        error: 'Error al actualizar HubSpot',
        details: error.response?.data || error.message
      });
    }
  });
});